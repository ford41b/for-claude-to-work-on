import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PetSettings, PetView } from '../types'

// Simulated sessions: the test stands in for the engine beneath the plugin,
// raising the events a real session raises and answering the tools itself.

const OTHER = "another mod's row"
const BAND = {
  plugin: 'claudeagotchi',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// The engine beneath: a session that starts, tools that take `ms` to run and
// answer what `answers` holds for their command, another mod's band row, and
// a record of every value the pet writes.
function world(on: On, opts: { store?: Record<string, unknown> } = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, opts.store ?? {})
  const answers = new Map<string, { isError?: true; text: string }>()
  const delays = new Map<string, number>()
  const pet = { view: undefined as PetView | undefined, settings: undefined as PetSettings | undefined, moods: [] as string[] }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async ($, e) => {
    const key = String((e as { command?: unknown }).command ?? e.tool)
    await clock.sleep(delays.get(key) ?? 50)
    const answer = answers.get(key) ?? { text: 'ok' }
    return answer.isError ? { isError: true, result: undefined, text: answer.text } : { result: { ok: true }, text: answer.text }
  })
  on('classic.PermissionRequest', () => ({}))
  on('state.set', async ($, e, next) => {
    const result = await next(e)
    if (e.plugin === 'claudeagotchi' && e.key === 'view') {
      pet.view = e.value as PetView
      pet.moods.push(pet.view.mood)
    }
    if (e.plugin === 'claudeagotchi' && e.key === 'settings') pet.settings = e.value as PetSettings
    return result
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{OTHER}</Text>
  })
  return { clock, answers, delays, pet, mood: () => pet.view?.mood }
}

async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
}

// Types `/pet <args>` at the prompt.
function pet$($: Engine, args: string) {
  return $.command.run({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
}

// Runs a tool call without waiting for it, as the model's call is in flight.
function call($: Engine, clock: MockClock, input: Record<string, unknown>) {
  const done = $.tool.call(input as Parameters<Engine['tool']['call']>[0])
  done.catch(() => {})
  return { done, settle: () => clock.settle() }
}

describe('first slice: idle, typing at the computer, idle again', () => {
  test('an edit puts him at the computer, long enough to enjoy, then he packs up', async ($, on) => {
    const { clock, delays, mood, pet } = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Claudeagotchi is standing by')

    delays.set('Edit', 200)
    const edit = call($, clock, { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    await edit.settle()
    expect(mood()).toBe('coding')
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('Claudeagotchi is typing at a tiny computer')
    expect(svg?.props.isInteractive).toBe(true)
    expect(String(svg?.props.source)).toContain('<animate')

    await clock.advance(200)
    await edit.done
    await clock.advance(2000) // the edit is long done, the typing goes on a little
    expect(mood()).toBe('coding')
    await clock.advance(2100)
    expect(mood()).toBe('unpacking')
    await clock.advance(400)
    expect(mood()).toBe('idle')
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Claudeagotchi is standing by')
    await ui.unmount()
  })

  test('the tool answers exactly what the engine answered, without waiting on the pet', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    const edit = call($, clock, { tool: 'Write', file_path: '/work/b.ts', content: 'x' })
    await clock.advance(50)
    expect(await edit.done).toMatchObject({ result: { ok: true }, text: 'ok' })
  })

  test("other mods' rows in the band stay, and the terminal draws only them", async ($, on) => {
    const { mood, pet } = world(on)
    await start($)
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desktop.find({ type: 'Svg' })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: OTHER })).toBeDefined()
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
    expect(await terminal.find({ type: 'Text', text: OTHER })).toBeDefined()
  })
})

describe('real activity', () => {
  test('reading, searching and running each get their own scene', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    const read = call($, clock, { tool: 'Read', file_path: '/work/a.ts' })
    await read.settle()
    expect(mood()).toBe('reading')
    await clock.advance(3000)
    const grep = call($, clock, { tool: 'Grep', pattern: 'todo' })
    await grep.settle()
    expect(mood()).toBe('searching')
    await clock.advance(3000)
    const bash = call($, clock, { tool: 'Bash', command: 'npm install' })
    await bash.settle()
    expect(mood()).toBe('running')
  })

  test('a shell command that writes a file counts as coding', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    const bash = call($, clock, { tool: 'Bash', command: "cat > notes.md <<'EOF'\nhi\nEOF" })
    await bash.settle()
    expect(mood()).toBe('coding')
  })

  test('a waiting model turn is thinking, and its end is idle, not success', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    await clock.settle()
    expect(mood()).toBe('thinking')
    await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(1000)
    expect(mood()).toBe('idle')
  })

  test('passing tests earn one hop; failing tests a startle that settles', async ($, on) => {
    const { clock, answers, mood, pet } = world(on)
    await start($)
    call($, clock, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('success')
    await clock.advance(2000)
    expect(mood()).toBe('idle')

    answers.set('npm test', { isError: true, text: 'Exit code 1' })
    call($, clock, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('error')
    await clock.advance(4500)
    expect(mood()).toBe('idle')
  })

  test('an interrupted command is no failure', async ($, on) => {
    const { clock, answers, mood, pet } = world(on)
    await start($)
    answers.set('npm test', { isError: true, text: 'Interrupted by user' })
    call($, clock, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).not.toBe('error')
  })

  test('a turn that dies on an API error is an error', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'error' })
    await clock.settle()
    expect(mood()).toBe('error')
  })
})

describe('priorities and timing', () => {
  test('a permission request interrupts typing at once and holds until answered', async ($, on) => {
    const { clock, delays, mood, pet } = world(on)
    await start($)
    delays.set('Edit', 60_000)
    call($, clock, { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(10)
    expect(mood()).toBe('coding')

    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })
    await clock.settle()
    expect(mood()).toBe('attention')
    await clock.advance(30_000) // nobody answered yet: he keeps waving
    expect(mood()).toBe('attention')

    delays.set('rm -rf build', 100)
    call($, clock, { tool: 'Bash', command: 'rm -rf build' }) // approved: the call runs
    await clock.settle()
    expect(mood()).toBe('coding') // the edit is still in flight
  })

  test('AskUserQuestion is attention for as long as the question is open', async ($, on) => {
    const { clock, delays, mood, pet } = world(on)
    await start($)
    delays.set('AskUserQuestion', 20_000)
    call($, clock, { tool: 'AskUserQuestion', questions: [] })
    await clock.advance(19_000)
    expect(mood()).toBe('attention')
    await clock.advance(1100)
    expect(mood()).toBe('idle')
  })

  test('a failure interrupts typing at once', async ($, on) => {
    const { clock, answers, delays, mood, pet } = world(on)
    await start($)
    delays.set('Edit', 10_000)
    call($, clock, { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(10)
    answers.set('cargo test', { isError: true, text: 'failed' })
    call($, clock, { tool: 'Bash', command: 'cargo test' })
    await clock.advance(60)
    expect(mood()).toBe('error')
    await clock.advance(4500)
    expect(mood()).toBe('coding')
  })

  test('an edit that finishes during a celebration still gets its typing', async ($, on) => {
    const { clock, delays, mood } = world(on)
    await start($)
    call($, clock, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('success')
    delays.set('Edit', 100)
    call($, clock, { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(1900) // the hop ends long after the edit did
    expect(mood()).toBe('coding')
  })

  test('a burst of quick tool calls does not flicker', async ($, on) => {
    const { clock, delays, mood, pet } = world(on)
    await start($)
    const before = pet.moods.length
    for (const tool of ['Read', 'Grep', 'Read', 'Glob', 'Read']) {
      delays.set(tool, 20)
      call($, clock, { tool, file_path: '/work/a.ts', pattern: 'x' })
      await clock.advance(30)
    }
    await clock.advance(5000)
    // reading, then searching (a peer, shown after reading's minimum), then idle.
    const seen = pet.moods.slice(before)
    expect(seen.length).toBeLessThanOrEqual(3)
    expect(seen[seen.length - 1]).toBe('idle')
  })

  test("a subagent's turn ending does not end the main turn's work", async ($, on) => {
    const { clock, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'agent-1' })
    await clock.advance(5000)
    expect(mood()).toBe('thinking')
  })

  test("a subagent still working keeps him busy after the main turn's end", async ($, on) => {
    const { clock, delays, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    delays.set('sleep 30', 30_000)
    call($, clock, { tool: 'Bash', command: 'sleep 30', agentId: 'agent-1' })
    await clock.settle()
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5000)
    expect(mood()).toBe('running')
    await clock.advance(26_000) // its command is done, the subagent is still at work
    expect(mood()).toBe('thinking')
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 't9', reason: 'answer', agentId: 'agent-1' })
    await clock.advance(2000)
    expect(mood()).toBe('idle')
  })

  test('one call finishing leaves the pet on the call still running', async ($, on) => {
    const { clock, delays, mood } = world(on)
    await start($)
    delays.set('npm run build', 20_000)
    call($, clock, { tool: 'Bash', command: 'npm run build' })
    await clock.advance(5000)
    call($, clock, { tool: 'Read', file_path: '/work/a.ts' })
    await clock.advance(5000)
    expect(mood()).toBe('running')
  })

  test('he rests after a few quiet minutes and wakes with a stretch', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    await clock.advance(3 * 60_000 + 10)
    expect(mood()).toBe('resting')
    call($, clock, { tool: 'Read', file_path: '/work/a.ts' })
    await clock.settle()
    expect(mood()).toBe('waking')
    await clock.advance(700)
    expect(mood()).not.toBe('resting')
  })
})

describe('/pet', () => {
  test('hides him, keeps the choice, stops his timers, and brings him back', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await pet$($, 'off')
    expect(pet.settings?.isEnabled).toBe(false)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: OTHER })).toBeDefined()

    // Hidden: activity and time pass without a single redraw.
    const before = pet.moods.length
    call($, clock, { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(10 * 60_000)
    expect(pet.moods.length).toBe(before)

    await pet$($, '')
    expect(pet.settings?.isEnabled).toBe(true)
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
  })

  test('the hidden choice holds in the next session', async ($, on) => {
    const { pet } = world(on, { store: { isEnabled: false } })
    await start($)
    expect(pet.settings?.isEnabled).toBe(false)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  })

  test('motion swaps the animation for still poses', async ($, on) => {
    const { mood, pet } = world(on)
    await start($)
    await pet$($, 'motion')
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.isInteractive).toBe(false)
    expect(String(svg?.props.source)).not.toContain('<animate')
  })

  test('preview walks through every state, then hands back to the session', async ($, on) => {
    const { clock, mood, pet } = world(on)
    await start($)
    const seen = new Set<string>()
    await pet$($, 'preview')
    for (let i = 0; i < 200; i++) {
      if (pet.view?.preview) seen.add(pet.view.preview)
      await clock.advance(500)
    }
    expect([...seen].sort()).toEqual(
      ['attention', 'coding', 'error', 'idle', 'reading', 'resting', 'running', 'searching', 'success', 'thinking'].sort(),
    )
    expect(pet.view?.preview).toBe(null)
  })
})
