import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PetMood, PetSettings, PetView } from '../types'
import { answerPermission, classify, decide, finishEdit, FLASH_MS, tracker, verdict, type Tracker } from './machine'
import { drawPet, MOODS, playMs, type PetDrawing } from './sprites'

// Claudeagotchi: a little orange companion in the band above the prompt that
// acts out what this session is doing. It only watches: every hook hands the
// event on unchanged and returns what the rest of the chain answered.

const view = atom({ plugin: 'claudeagotchi', key: 'view' } as const, {
  mood: 'idle',
  variant: 0,
  seq: 0,
  preview: null,
} as PetView)
const settings = atom({ plugin: 'claudeagotchi', key: 'settings' } as const, {
  isEnabled: true,
  isReducedMotion: false,
} as PetSettings)

const ONE_SHOT = new Set<PetMood>(['success', 'waking', 'unpacking'])
const PREVIEW_ORDER = MOODS.filter(m => m !== 'unpacking' && m !== 'waking')
const PREVIEW_LOOP_MS = 5200
const PREVIEW_CODING_MS = 9000

type Dollar = EngineInterface

// This session's pet. A reload starts it over, which only resets the counts.
const pet = {
  t: tracker(0) as Tracker,
  isEnabled: true,
  timer: undefined as Timer | undefined,
  previewTimer: undefined as Timer | undefined,
  queue: Promise.resolve() as Promise<void>,
  nextId: 0,
}

// Every change goes through here, one at a time, stamped with the clock.
function act($: Dollar, change?: (t: Tracker, now: number) => void): Promise<void> {
  pet.queue = pet.queue
    .then(async () => {
      const now = await $.clock.now()
      change?.(pet.t, now)
      if (pet.isEnabled) await show($, now)
    })
    .catch(() => {})
  return pet.queue
}

// Decides the mood, draws it when it changed, and sleeps until the next
// moment the decision could change: no polling while nothing happens.
async function show($: Dollar, now: number) {
  pet.timer?.cancel()
  pet.timer = undefined
  const t = pet.t
  const { mood, nextAt } = decide(t, now)
  if (mood !== t.shown) {
    t.shown = mood
    t.shownAt = now
    if (!pet.previewTimer) {
      await update($, view, v => ({
        ...v,
        mood,
        seq: v.seq + 1,
        variant: mood === 'idle' ? (v.variant + 1) % 2 : v.variant,
      }))
    }
  }
  if (Number.isFinite(nextAt)) pet.timer = $.clock.after(Math.max(1, nextAt - now), () => void act($))
}

async function stopPreview($: Dollar) {
  pet.previewTimer?.cancel()
  pet.previewTimer = undefined
  await update($, view, v => ({ ...v, preview: null, mood: pet.t.shown, seq: v.seq + 1 }))
}

// Plays every mood in turn from local artwork alone: no model, no tools.
async function previewStep($: Dollar, i: number) {
  const mood = PREVIEW_ORDER[i]
  if (!mood) return stopPreview($)
  await update($, view, v => ({ ...v, preview: mood, mood, seq: v.seq + 1 }))
  const isLoop = playMs(mood) === Infinity
  const ms = mood === 'coding' ? PREVIEW_CODING_MS : isLoop ? PREVIEW_LOOP_MS : playMs(mood) + 1400
  pet.previewTimer = $.clock.after(ms, () => void previewStep($, i + 1))
}

async function setEnabled($: Dollar, isEnabled: boolean) {
  pet.isEnabled = isEnabled
  await $.store.set('isEnabled', isEnabled)
  await update($, settings, s => ({ ...s, isEnabled }))
  if (isEnabled) {
    const now = await $.clock.now()
    pet.t.shown = 'idle'
    pet.t.shownAt = now
    pet.t.lastActive = now
    await update($, view, (v): PetView => ({ ...v, mood: 'idle', seq: v.seq + 1 }))
    await act($)
  } else {
    // Hidden: no timer stays running; the hooks only keep their counts.
    pet.timer?.cancel()
    pet.timer = undefined
    if (pet.previewTimer) await stopPreview($)
  }
}

async function setReducedMotion($: Dollar, isReducedMotion: boolean) {
  await $.store.set('isReducedMotion', isReducedMotion)
  await update($, settings, s => ({ ...s, isReducedMotion }))
}

const drawings = new Map<string, PetDrawing>()

function drawingOf(mood: PetMood, variant: number, isReducedMotion: boolean, seq: number): PetDrawing {
  const key = `${mood}:${variant}:${isReducedMotion}`
  let d = drawings.get(key)
  if (!d) drawings.set(key, (d = drawPet(mood, { variant, reducedMotion: isReducedMotion })))
  // A one-shot replays only from a fresh document, so its source changes per showing.
  if (!ONE_SHOT.has(mood) || isReducedMotion) return d
  return { ...d, source: d.source.replace('</svg>', `<!--${seq}--></svg>`) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const storedEnabled = await $.store.get('isEnabled')
    const storedReduced = await $.store.get('isReducedMotion')
    pet.isEnabled = storedEnabled !== false
    await update($, settings, () => ({ isEnabled: pet.isEnabled, isReducedMotion: storedReduced === true }))
    pet.t = tracker(await $.clock.now())
    await update($, view, (v): PetView => ({ ...v, mood: 'idle', preview: null, seq: v.seq + 1 }))
    if (pet.isEnabled) await act($)
    await $.command.register({
      name: 'pet',
      description: 'Claudeagotchi: show or hide the pet (on, off, motion, preview, status)',
      argumentHint: '[on|off|motion|preview|status]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const s = await read($, settings)
    switch (e.args.trim().toLowerCase()) {
      case '':
      case 'toggle':
        await setEnabled($, !s.isEnabled)
        return { text: s.isEnabled ? 'Claudeagotchi is hidden. /pet brings him back.' : 'Claudeagotchi is back.' }
      case 'on':
      case 'show':
        await setEnabled($, true)
        return { text: 'Claudeagotchi is shown.' }
      case 'off':
      case 'hide':
        await setEnabled($, false)
        return { text: 'Claudeagotchi is hidden. /pet brings him back.' }
      case 'motion':
        await setReducedMotion($, !s.isReducedMotion)
        return { text: s.isReducedMotion ? 'Claudeagotchi animates again.' : 'Claudeagotchi holds still poses now.' }
      case 'preview':
        if (pet.previewTimer) {
          await stopPreview($)
          return { text: 'Preview stopped.' }
        }
        await previewStep($, 0)
        return { text: 'Previewing every Claudeagotchi state, about a minute. /pet preview again stops it.' }
      case 'status':
        return {
          text: `Claudeagotchi is ${s.isEnabled ? 'shown' : 'hidden'}, ${s.isReducedMotion ? 'in still poses' : 'animated'}, now ${pet.t.shown}.`,
        }
      default:
        return { text: 'Usage: /pet [on|off|motion|preview|status]. /pet alone shows or hides him.' }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    void act($, (t, now) => {
      t.lastActive = now
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    void act($, (t, now) => {
      t.isTurn = true
      t.lastActive = now
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    const reason = e.reason
    void act($, (t, now) => {
      t.lastActive = now
      if (agentId) {
        t.agents.delete(agentId)
        return
      }
      t.isTurn = false
      t.permissions = []
      t.elicitations = 0
      for (const [id, call] of t.calls) if (!call.agentId) t.calls.delete(id)
      // An API failure or a refusal is a confirmed failure; an interrupt is not,
      // and a turn that simply ended says nothing about success.
      if (reason === 'error' || reason === 'refusal') t.flash = { mood: 'error', until: now + FLASH_MS.error }
    })
    return next(e)
  })

  // Never awaits its own bookkeeping before the tool runs, and returns the
  // tool's answer exactly as the chain gave it.
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `own-${pet.nextId++}`
    const tool = String(e.tool)
    const agentId = e.agentId
    const { activity, verifies } = classify(tool, e as unknown as Record<string, unknown>)
    void act($, (t, now) => {
      t.lastActive = now
      if (agentId) t.agents.add(agentId)
      t.calls.set(id, { activity, agentId })
      answerPermission(t, tool)
    })
    const result = await next(e)
    const outcome = verifies
      ? verdict({ isDenied: 'deny' in result && !!result.deny, isError: result.isError === true, text: result.text })
      : undefined
    void act($, (t, now) => {
      t.lastActive = now
      t.calls.delete(id)
      answerPermission(t, tool)
      if (activity === 'edit') finishEdit(t, now, t.shown === 'coding')
      if (outcome) t.flash = { mood: outcome, until: now + FLASH_MS[outcome] }
    })
    return result
  }).catch(($, e, next) => next(e))

  // A permission dialog is about to be shown, unless a settings hook decided.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    const tool = e.tool_name
    if (!result.decision) {
      void act($, t => {
        t.permissions.push(tool)
      })
    }
    return result
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    const tool = e.tool_name
    void act($, t => answerPermission(t, tool))
    return next(e)
  })

  on('classic.Elicitation', async ($, e, next) => {
    const result = await next(e)
    void act($, t => {
      t.elicitations++
    })
    return result
  })

  on('classic.ElicitationResult', async ($, e, next) => {
    void act($, t => {
      t.elicitations = Math.max(0, t.elicitations - 1)
    })
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const { isEnabled, isReducedMotion } = await read($, settings)
    const v = await read($, view)
    if ((!isEnabled && !v.preview) || e.props.hasSurvey) return below
    const table = $.ui.resolve(e)
    if (!('Svg' in table)) return below // the terminal has no vector drawing
    const { Box, Svg, Text } = table
    const d = drawingOf(v.mood, v.variant, isReducedMotion, v.seq)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="flex-end">
          <Svg source={d.source} alt={d.alt} width={d.width} height={d.height} isInteractive={d.isAnimated} />
          {v.preview && <Text dimColor> preview: {v.preview}</Text>}
        </Box>
        {below}
      </Box>
    )
  })
}
