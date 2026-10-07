import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PetSettings, PetView } from '../types'
import { classify, isVerifyCommand } from '../hooks/machine'

// Simulated sessions: the test stands in for the engine beneath the plugin.
// Its tools behave the way a real session was seen to: the permission check
// runs inside the call, a dialog opens inside the call, and PostToolUse or
// PostToolUseFailure fire only for a command that actually ran.

const OTHER = "another mod's row"
const BAND = {
  plugin: 'claudeagotchi',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const
const REFUSAL =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."

type Answer = { isError?: true; text: string; result?: Record<string, unknown>; isInterrupt?: boolean }

function world(on: On, opts: { store?: Record<string, unknown> } = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, opts.store ?? {})
  const ref = { eng: undefined as Engine | undefined }
  const answers = new Map<string, Answer>()
  const delays = new Map<string, number>()
  const asks = new Map<string, { afterMs: number; isRefused?: boolean }>() // dialogs by command
  const throws = new Set<string>()
  const pet = { view: undefined as PetView | undefined, settings: undefined as PetSettings | undefined, moods: [] as string[] }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', ($, e) => {
    const input = (e.input ?? {}) as { command?: unknown }
    return { decision: asks.has(String(input.command ?? e.tool)) ? 'ask' : 'allow' }
  })
  on('tool.call', async ($, e) => {
    const eng = ref.eng!
    const input = e as unknown as Record<string, unknown>
    const key = String(input.command ?? e.tool)
    const agent = e.agentId ? { agent_id: e.agentId } : {}
    await eng.tool.check({ tool: String(e.tool), input, tool_use_id: e.tool_use_id })
    const ask = asks.get(key)
    if (ask) {
      await eng.classic.PermissionRequest({ tool_name: String(e.tool), tool_input: input, ...agent })
      await clock.sleep(ask.afterMs)
      if (ask.isRefused) return { isError: true, result: undefined, text: REFUSAL }
    }
    await clock.sleep(delays.get(key) ?? 50)
    if (throws.has(key)) throw new Error('the link beneath failed')
    const answer = answers.get(key) ?? { text: 'ok' }
    const ids = { tool_name: String(e.tool), tool_input: input, tool_use_id: e.tool_use_id ?? 'none', ...agent }
    if (answer.isError) {
      await eng.classic.PostToolUseFailure({ ...ids, error: answer.text, is_interrupt: answer.isInterrupt })
      return { isError: true, result: undefined, text: answer.text }
    }
    const result = answer.result ?? { ok: true }
    await eng.classic.PostToolUse({ ...ids, tool_response: result })
    return { result, text: answer.text }
  })
  on('classic.PermissionRequest', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('classic.PostToolUseFailure', () => ({}))
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

  const start = async ($: Engine) => {
    ref.eng = $
    await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  }
  // Runs a tool call without waiting for it, as the model's call is in flight.
  const call = ($: Engine, input: Record<string, unknown>) => {
    const done = $.tool.call(input as Parameters<Engine['tool']['call']>[0])
    done.catch(() => {})
    return done
  }
  return { clock, answers, delays, asks, throws, pet, start, call, mood: () => pet.view?.mood }
}

// Types `/pet <args>` at the prompt.
function pet$($: Engine, args: string) {
  return $.command.run({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
}

const EDIT = { tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' }
const turnEnd = (turnId: string, extra: Record<string, unknown> = {}) => ({
  answer: '',
  durationMs: 10,
  isAborted: false,
  turnId,
  reason: 'answer' as const,
  ...extra,
})

describe('first slice: idle, typing at the computer, idle again', () => {
  test('an edit puts him at the computer, long enough to enjoy, then he packs up', async ($, on) => {
    const { clock, delays, start, call, mood } = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Claudeagotchi is standing by')

    delays.set('Edit', 200)
    const edit = call($, EDIT)
    await clock.settle()
    expect(mood()).toBe('coding')
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('Claudeagotchi is typing at a tiny computer')
    expect(svg?.props.isInteractive).toBe(true)
    expect(String(svg?.props.source)).toContain('<animate')

    await clock.advance(200)
    await edit
    await clock.advance(2000) // the edit is long done, the typing goes on a little
    expect(mood()).toBe('coding')
    await clock.advance(2100)
    expect(mood()).toBe('unpacking')
    await clock.advance(400)
    expect(mood()).toBe('idle')
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Claudeagotchi is standing by')
    await ui.unmount()
  })

  test('the tool answers exactly what the engine answered', async ($, on) => {
    const { clock, start, call } = world(on)
    await start($)
    const write = call($, { tool: 'Write', file_path: '/work/b.ts', content: 'x' })
    await clock.advance(50)
    expect(await write).toMatchObject({ result: { ok: true }, text: 'ok' })
  })

  test("other mods' rows in the band stay, and the terminal draws only them", async ($, on) => {
    const { start } = world(on)
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
    const { clock, start, call, mood } = world(on)
    await start($)
    call($, { tool: 'Read', file_path: '/work/a.ts' })
    await clock.settle()
    expect(mood()).toBe('reading')
    await clock.advance(3000)
    call($, { tool: 'Grep', pattern: 'todo' })
    await clock.settle()
    expect(mood()).toBe('searching')
    await clock.advance(3000)
    call($, { tool: 'Bash', command: 'npm install' })
    await clock.settle()
    expect(mood()).toBe('running')
  })

  test('a shell command that writes a file counts as coding', async ($, on) => {
    const { clock, start, call, mood } = world(on)
    await start($)
    call($, { tool: 'Bash', command: "cat > notes.md <<'EOF'\nhi\nEOF" })
    await clock.settle()
    expect(mood()).toBe('coding')
  })

  test('a waiting model turn is thinking, and its end is idle, not success', async ($, on) => {
    const { clock, start, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    await clock.settle()
    expect(mood()).toBe('thinking')
    await $.turn.complete(turnEnd('t1', { answer: 'done' }))
    await clock.advance(1000)
    expect(mood()).toBe('idle')
  })

  test('passing tests earn one hop; failing tests a startle that settles', async ($, on) => {
    const { clock, answers, start, call, mood } = world(on)
    await start($)
    call($, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('success')
    await clock.advance(2000)
    expect(mood()).toBe('idle')

    answers.set('npm test', { isError: true, text: 'Exit code 1' })
    call($, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('error')
    await clock.advance(4500)
    expect(mood()).toBe('idle')
  })

  test('an interrupted command is no failure', async ($, on) => {
    const { clock, answers, start, call, mood } = world(on)
    await start($)
    answers.set('npm test', { isError: true, text: 'Interrupted by user', isInterrupt: true })
    call($, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).not.toBe('error')
  })

  test('a test run sent to the background earns no hop when it launches', async ($, on) => {
    const { clock, answers, start, call, mood } = world(on)
    await start($)
    call($, { tool: 'Bash', command: 'npm test', run_in_background: true })
    answers.set('npm run build', { text: 'moved to background', result: { backgroundTaskId: 'b1' } })
    call($, { tool: 'Bash', command: 'npm run build' })
    await clock.advance(60)
    expect(mood()).not.toBe('success')
  })

  test('a turn that dies on an API error is an error', async ($, on) => {
    const { clock, start, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete(turnEnd('t1', { reason: 'error' }))
    await clock.settle()
    expect(mood()).toBe('error')
  })

  test('a call whose engine link fails is still cleared', async ($, on) => {
    const { clock, throws, start, call, mood } = world(on)
    await start($)
    throws.add('npm install')
    call($, { tool: 'Bash', command: 'npm install' })
    await clock.advance(5000)
    expect(mood()).toBe('idle')
  })
})

describe('permission dialogs', () => {
  test('a dialog interrupts typing at once and holds while unanswered', async ($, on) => {
    const { clock, asks, delays, start, call, mood } = world(on)
    await start($)
    delays.set('Edit', 60_000)
    call($, EDIT)
    await clock.advance(10)
    expect(mood()).toBe('coding')

    asks.set('rm -rf build', { afterMs: 30_000 })
    call($, { tool: 'Bash', command: 'rm -rf build' })
    await clock.settle()
    expect(mood()).toBe('attention')
    await clock.advance(29_000) // nobody answered yet: he keeps waving
    expect(mood()).toBe('attention')
    await clock.advance(1200) // approved, and the command finished
    expect(mood()).toBe('coding') // the edit is still in flight
  })

  test("another call of the same tool finishing does not end someone's dialog", async ($, on) => {
    const { clock, asks, delays, start, call, mood } = world(on)
    await start($)
    asks.set('rm -rf build', { afterMs: 60_000 })
    call($, { tool: 'Bash', command: 'rm -rf build' })
    delays.set('git status', 100)
    call($, { tool: 'Bash', command: 'git status' })
    await clock.advance(5000)
    expect(mood()).toBe('attention')
  })

  test('declining a test command at the dialog is no failure', async ($, on) => {
    const { clock, asks, start, call, mood } = world(on)
    await start($)
    asks.set('npm test', { afterMs: 2000, isRefused: true })
    call($, { tool: 'Bash', command: 'npm test' })
    await clock.advance(2100)
    expect(mood()).not.toBe('error')
  })

  test('an edit waiting for permission never flashes the computer first', async ($, on) => {
    const { clock, asks, pet, start, call, mood } = world(on)
    await start($)
    asks.set('Edit', { afterMs: 3000 })
    call($, EDIT)
    await clock.advance(1000)
    expect(mood()).toBe('attention')
    expect(pet.moods).not.toContain('coding')
    await clock.advance(2200) // approved and written: now he types
    expect(mood()).toBe('coding')
  })

  test("a subagent's open dialog outlives the main turn's end", async ($, on) => {
    const { clock, asks, start, call, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    asks.set('rm -rf dist', { afterMs: 60_000 })
    call($, { tool: 'Bash', command: 'rm -rf dist', agentId: 'agent-1' })
    await clock.settle()
    await $.turn.complete(turnEnd('t1'))
    await clock.advance(1000)
    expect(mood()).toBe('attention')
  })

  test('AskUserQuestion is attention for as long as the question is open', async ($, on) => {
    const { clock, delays, start, call, mood } = world(on)
    await start($)
    delays.set('AskUserQuestion', 20_000)
    call($, { tool: 'AskUserQuestion', questions: [] })
    await clock.advance(19_000)
    expect(mood()).toBe('attention')
    await clock.advance(1100)
    expect(mood()).toBe('idle')
  })

  test('a blocked MCP form raises no arm', async ($, on) => {
    const { clock, start, mood } = world(on)
    on('classic.Elicitation', () => ({ block: 'declined by a settings hook' }))
    await start($)
    await $.classic.Elicitation({ mcp_server_name: 'srv', message: 'fill', mode: 'form', requested_schema: {} } as never)
    await clock.settle()
    expect(mood()).toBe('idle')
  })
})

describe('priorities and timing', () => {
  test('a failure interrupts typing at once, and the typing resumes after', async ($, on) => {
    const { clock, answers, delays, start, call, mood } = world(on)
    await start($)
    delays.set('Edit', 10_000)
    call($, EDIT)
    await clock.advance(10)
    answers.set('cargo test', { isError: true, text: 'failed' })
    call($, { tool: 'Bash', command: 'cargo test' })
    await clock.advance(60)
    expect(mood()).toBe('error')
    await clock.advance(4500)
    expect(mood()).toBe('coding')
  })

  test('an edit that finishes during a celebration still gets its typing', async ($, on) => {
    const { clock, delays, start, call, mood } = world(on)
    await start($)
    call($, { tool: 'Bash', command: 'npm test' })
    await clock.advance(60)
    expect(mood()).toBe('success')
    delays.set('Edit', 100)
    call($, EDIT)
    await clock.advance(1900) // the hop ends long after the edit did
    expect(mood()).toBe('coding')
  })

  test('an edit that finishes during an error still gets its typing afterwards', async ($, on) => {
    const { clock, answers, delays, start, call, mood } = world(on)
    await start($)
    answers.set('pytest', { isError: true, text: 'Exit code 1' })
    call($, { tool: 'Bash', command: 'pytest' })
    await clock.advance(60)
    delays.set('Edit', 100)
    call($, EDIT)
    await clock.advance(4500)
    expect(mood()).toBe('coding')
  })

  test('a burst of quick tool calls does not flicker', async ($, on) => {
    const { clock, delays, pet, start, call } = world(on)
    await start($)
    const before = pet.moods.length
    for (const tool of ['Read', 'Grep', 'Read', 'Glob', 'Read']) {
      delays.set(tool, 20)
      call($, { tool, file_path: '/work/a.ts', pattern: 'x' })
      await clock.advance(30)
    }
    await clock.advance(5000)
    const seen = pet.moods.slice(before)
    expect(seen.length).toBeLessThanOrEqual(3)
    expect(seen[seen.length - 1]).toBe('idle')
  })

  test("a subagent still working keeps him busy after the main turn's end", async ($, on) => {
    const { clock, delays, start, call, mood } = world(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    delays.set('sleep 30', 30_000)
    call($, { tool: 'Bash', command: 'sleep 30', agentId: 'agent-1' })
    await clock.settle()
    await $.turn.complete(turnEnd('t1'))
    await clock.advance(5000)
    expect(mood()).toBe('running')
    await clock.advance(26_000) // its command is done, the subagent is still at work
    expect(mood()).toBe('thinking')
    await $.turn.complete(turnEnd('t9', { agentId: 'agent-1' }))
    await clock.advance(2000)
    expect(mood()).toBe('idle')
  })

  test('an agent sent to the background keeps him thinking until it reports', async ($, on) => {
    const { clock, answers, start, call, mood } = world(on)
    await start($)
    answers.set('Agent', { text: 'launched', result: { status: 'async_launched', agentId: 'bg-1', description: 'x' } })
    call($, { tool: 'Agent', description: 'x', prompt: 'y', subagent_type: 'general-purpose' })
    await clock.advance(5000)
    expect(mood()).toBe('thinking')
    await $.turn.complete(turnEnd('t2', { agentId: 'bg-1' }))
    await clock.advance(2000)
    expect(mood()).toBe('idle')
  })

  test('one call finishing leaves the pet on the call still running', async ($, on) => {
    const { clock, delays, start, call, mood } = world(on)
    await start($)
    delays.set('npm install', 20_000)
    call($, { tool: 'Bash', command: 'npm install' })
    await clock.advance(5000)
    call($, { tool: 'Read', file_path: '/work/a.ts' })
    await clock.advance(5000)
    expect(mood()).toBe('running')
  })

  test('he rests after a few quiet minutes and wakes with a stretch', async ($, on) => {
    const { clock, start, call, mood } = world(on)
    await start($)
    await clock.advance(3 * 60_000 + 10)
    expect(mood()).toBe('resting')
    call($, { tool: 'Read', file_path: '/work/a.ts' })
    await clock.settle()
    expect(mood()).toBe('waking')
    await clock.advance(700)
    expect(mood()).not.toBe('resting')
  })
})

describe('reading shell commands', () => {
  test('only a build or test whose own exit decides the status counts', () => {
    for (const yes of ['npm test', 'cd app && npm test', 'CI=1 npm test -- --watch=false', 'npx tsc --noEmit', 'cargo test', 'pytest -q tests/', 'make']) {
      expect(isVerifyCommand(yes)).toBe(true)
    }
    for (const no of [
      'npm test | tail -20',
      'npm test || true',
      'npm test; echo done',
      'npm test &',
      'git commit -m "fix build"',
      'grep -r test src',
      'echo "run the tests"',
      'ls build',
    ]) {
      expect(isVerifyCommand(no)).toBe(false)
    }
  })

  test('quotes and heredocs are not read as shell', () => {
    expect(classify('Bash', { command: "rg 'Array<string>' src" }).activity).toBe('search')
    expect(classify('Bash', { command: 'grep -n "=>" app.ts' }).activity).toBe('search')
    expect(classify('Bash', { command: "cat > notes.md <<'EOF'\na > b\nEOF" }).activity).toBe('edit')
    expect(classify('Bash', { command: 'grep foo src > out.txt' }).activity).toBe('edit')
    expect(classify('Bash', { command: 'sed -n 1,20p file.ts' }).activity).toBe('read')
  })
})

describe('/pet', () => {
  test('hides him, keeps the choice, stops his timers, and brings him back', async ($, on) => {
    const { clock, pet, start, call } = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await pet$($, 'off')
    expect(pet.settings?.isEnabled).toBe(false)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: OTHER })).toBeDefined()

    // Hidden: activity and time pass without a single redraw.
    const before = pet.moods.length
    call($, EDIT)
    await clock.advance(10 * 60_000)
    expect(pet.moods.length).toBe(before)

    await pet$($, '')
    expect(pet.settings?.isEnabled).toBe(true)
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
  })

  test('the hidden choice holds in the next session', async ($, on) => {
    const { start } = world(on, { store: { isEnabled: false } })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  })

  test('motion swaps the animation for still poses, and that is remembered', async ($, on) => {
    const { start, pet } = world(on)
    await start($)
    await pet$($, 'motion')
    expect(pet.settings?.isReducedMotion).toBe(true)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.isInteractive).toBe(false)
    expect(String(svg?.props.source)).not.toContain('<animate')
  })

  test('preview walks through every state, then hands back to the session', async ($, on) => {
    const { clock, pet, start } = world(on)
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

  test('a real permission dialog ends the preview at once', async ($, on) => {
    const { clock, asks, pet, start, call, mood } = world(on)
    await start($)
    await pet$($, 'preview')
    await clock.advance(1000)
    asks.set('rm -rf build', { afterMs: 60_000 })
    call($, { tool: 'Bash', command: 'rm -rf build' })
    await clock.settle()
    expect(pet.view?.preview).toBe(null)
    expect(mood()).toBe('attention')
  })

  test('hiding him during a preview stops it for good', async ($, on) => {
    const { clock, pet, start } = world(on)
    await start($)
    await pet$($, 'preview')
    await clock.advance(1000)
    await pet$($, 'off')
    await clock.advance(60_000)
    expect(pet.view?.preview).toBe(null)
  })
})
