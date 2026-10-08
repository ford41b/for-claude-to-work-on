import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PetCache, PetMood, PetPanel, PetSettings, PetTtl, PetView } from '../types'
import { parseTail, readout, readoutKey } from './cache'
import {
  checkCall,
  classify,
  decide,
  denyCall,
  endCall,
  endTurn,
  flash,
  freshProgress,
  noteCall,
  openDialog,
  progressOf,
  startCall,
  tracker,
  wasBackgrounded,
  type Tracker,
} from './machine'
import { drawPanel, type PanelMotion } from './panel'
import { drawPet, MOODS, playMs, walkMs, type PetDrawing } from './sprites'

// Claudeagotchi: a little orange companion in the band above the prompt that
// acts out what this session is doing. It only watches: every hook hands the
// event on unchanged and returns what the rest of the chain answered.

const view = atom({ plugin: 'claudeagotchi', key: 'view' } as const, {
  mood: 'idle',
  variant: 0,
  seq: 0,
  preview: null,
  from: 0,
  to: 0,
} as PetView)
const settings = atom({ plugin: 'claudeagotchi', key: 'settings' } as const, {
  isEnabled: true,
  isReducedMotion: false,
} as PetSettings)
const cache = atom({ plugin: 'claudeagotchi', key: 'cache' } as const, {
  lastHit: null,
  detected: null,
  override: null,
  remembered: null,
} as PetCache)
const panel = atom({ plugin: 'claudeagotchi', key: 'panel' } as const, {
  isOpen: false,
  changedAt: 0,
  phase: 'idle',
  note: '',
} as PetPanel)

const ONE_SHOT = new Set<PetMood>(['success', 'waking', 'unpacking'])
const PREVIEW_ORDER = MOODS.filter(m => m !== 'unpacking' && m !== 'waking')
const PREVIEW_MS: Partial<Record<PetMood, number>> = { coding: 9000, resting: 9800 }
const PREVIEW_LOOP_MS = 5200
// The desktop lays the band out in columns of its monospace metric; this many
// CSS px each turns the band's width into the strip he walks along.
const PX_PER_COLUMN = 8
// He moves along the strip only once the task has moved on this much.
const MIN_STRIDE = 0.04
// The panel's button sits at the strip's right end, about this many columns wide.
const BUTTON_COLUMNS = 10
// How long the panel takes to grow out of him or shrink back, with a margin.
const MOTION_MS = 300
// How much of the transcript's end to read for the cache: enough to hold the
// last response after a large tool result.
const TAIL_BYTES = '4000000'
// Claude Code names a project's folder after its path, cut to this length.
const PROJECT_SLUG_MAX = 200

// What the fork is asked for when the person hands off to a fresh session.
const BRIEF_PROMPT = [
  'Write a handoff brief so a fresh Claude Code session, with no memory of this conversation, can carry on the work.',
  'Use these headings: Goal; Done so far; Current state; Open issues; Next steps; Key files and decisions.',
  'Be specific: name files, functions, commands, branches and settings, and anything the user asked for that is still pending or was decided against.',
  'Keep it under 500 words. Reply with the brief alone.',
].join(' ')
const HANDOFF_INTRO = 'Handoff brief from my previous session, which I closed to start fresh. Pick up from here.\n\n'

type Dollar = EngineInterface

// This session's pet. A reload starts it over, which only resets the counts.
const pet = {
  t: tracker(0) as Tracker,
  isEnabled: true,
  timer: undefined as Timer | undefined,
  isPreviewing: false,
  previewTimer: undefined as Timer | undefined,
  previewRun: 0, // bumped by every start and stop, so a stale step stands down
  isWorkingPending: false,
  progress: freshProgress(),
  walk: { from: 0, to: 0, start: 0, ms: 0 }, // his latest walk along the strip
  stripPx: 600,
  ticker: undefined as Timer | undefined,
  drawnKey: '', // what the cache readout and panel last drew, so the ticker redraws only on change
  wasOpen: false,
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

// Where along the strip he is right now, partway through a walk or not.
function positionAt(now: number): number {
  const w = pet.walk
  if (w.ms <= 0 || now >= w.start + w.ms) return w.to
  return w.from + ((w.to - w.from) * (now - w.start)) / w.ms
}

// Starts a walk from wherever he is to `to` (staying put when they match).
function walkTo(now: number, to: number) {
  const from = positionAt(now)
  pet.walk = { from, to, start: now, ms: walkMs({ px: pet.stripPx, from, to }) }
}

// Decides the mood and his place on the strip, draws them when they changed,
// and sleeps until the next moment the decision could change: no polling
// while nothing happens.
async function show($: Dollar, now: number) {
  pet.timer?.cancel()
  pet.timer = undefined
  const t = pet.t
  const { mood, nextAt } = decide(t, now)
  // Something real needs the person: a preview gives way at once.
  if (pet.isPreviewing && (mood === 'attention' || mood === 'error')) await stopPreview($)
  const isMoodChange = mood !== t.shown
  // He walks between activities, or while idle or thinking, toward how far
  // the task has come; never while something needs the person, nor asleep.
  const isUrgent = mood === 'attention' || mood === 'error'
  const goal = progressOf(pet.progress)
  // While the panel is open beside him he holds his place, so he never walks under it.
  const isHeld = (await read($, panel)).isOpen
  const mayWalk = !isHeld && !isUrgent && mood !== 'resting' && (isMoodChange || mood === 'idle' || mood === 'thinking')
  const isStride = mayWalk && Math.abs(goal - pet.walk.to) >= MIN_STRIDE
  if (isUrgent && isMoodChange) walkTo(now, positionAt(now)) // stop where he stands
  else if (isStride) walkTo(now, goal)
  else if (isMoodChange) walkTo(now, pet.walk.to) // carry on any walk under way
  if (isMoodChange) {
    t.shown = mood
    t.shownAt = now
  }
  if ((isMoodChange || isStride) && !pet.isPreviewing) {
    const { from, to } = pet.walk
    await update($, view, v => ({
      ...v,
      mood,
      from,
      to,
      seq: v.seq + 1,
      variant: mood === 'idle' && isMoodChange ? (v.variant + 1) % 2 : v.variant,
    }))
  }
  if (Number.isFinite(nextAt)) pet.timer = $.clock.after(Math.max(1, nextAt - now), () => void act($))
}

async function stopPreview($: Dollar) {
  pet.isPreviewing = false
  pet.previewRun++
  pet.previewTimer?.cancel()
  pet.previewTimer = undefined
  const now = await $.clock.now()
  walkTo(now, pet.walk.to)
  const { from, to } = pet.walk
  await update($, view, v => ({ ...v, preview: null, mood: pet.t.shown, from, to, seq: v.seq + 1 }))
}

// Plays every mood in turn from local artwork alone: no model, no tools.
async function previewStep($: Dollar, run: number, i: number) {
  const mood = PREVIEW_ORDER[i]
  if (run !== pet.previewRun) return
  if (!mood) return stopPreview($)
  // He walks the strip from end to end over the preview.
  walkTo(await $.clock.now(), i / (PREVIEW_ORDER.length - 1))
  const { from, to } = pet.walk
  await update($, view, v => ({ ...v, preview: mood, mood, from, to, seq: v.seq + 1 }))
  if (run !== pet.previewRun) {
    // Stopped while this step was being drawn: put the live mood back.
    await update($, view, v => ({ ...v, preview: null, mood: pet.t.shown, seq: v.seq + 1 }))
    return
  }
  const ms = PREVIEW_MS[mood] ?? (playMs(mood) === Infinity ? PREVIEW_LOOP_MS : playMs(mood) + 1400)
  pet.previewTimer = $.clock.after(ms, () => void previewStep($, run, i + 1))
}

async function startPreview($: Dollar) {
  pet.isPreviewing = true
  pet.previewRun++
  await previewStep($, pet.previewRun, 0)
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
    if (pet.isPreviewing) await stopPreview($)
  }
}

async function setReducedMotion($: Dollar, isReducedMotion: boolean) {
  await $.store.set('isReducedMotion', isReducedMotion)
  await update($, settings, s => ({ ...s, isReducedMotion }))
}

// The cache's countdown ---------------------------------------------------

// The TTL picked with /pet cache, and the last one any session's transcript
// reported, from the plugin's store into the session's state.
async function loadCacheChoices($: Dollar) {
  const isTtl = (v: unknown): v is PetTtl => v === '5m' || v === '1h'
  const override = await $.store.get('cacheTtl')
  const remembered = await $.store.get('lastSeenTtl')
  await update($, cache, c => ({ ...c, override: isTtl(override) ? override : null, remembered: isTtl(remembered) ? remembered : null }))
}

// Reads the transcript's end: the TTL of the latest cache write, and the last
// request if it is newer than the one already counted. Where `tail` is
// missing (Windows) the countdown still runs, on the remembered TTL.
async function learnFromTranscript($: Dollar, path: string | undefined) {
  if (!path) return
  const out = await $.process.run(['tail', '-c', TAIL_BYTES, path]).catch(() => null)
  if (!out || out.exitCode !== 0) return
  const found = parseTail(out.stdout)
  if (!found) return
  if (found.ttl) await $.store.set('lastSeenTtl', found.ttl)
  await update($, cache, c => ({
    ...c,
    detected: found.ttl ?? c.detected,
    remembered: found.ttl ?? c.remembered,
    lastHit: Math.max(c.lastHit ?? 0, found.sentAt),
  }))
}

// The session's transcript under ~/.claude/projects, named by the session id.
async function transcriptPath($: Dollar): Promise<string | null> {
  const projects = ((await $.env.get('CLAUDE_CONFIG_DIR')) || (await $.env.get('HOME')) + '/.claude') + '/projects/'
  const file = '/' + (await $.session.id()) + '.jsonl'
  const slug = (await $.session.cwd()).replace(/[^a-zA-Z0-9]/g, '-')
  if (slug.length <= PROJECT_SLUG_MAX) return (await $.fs.exists(projects + slug + file)) ? projects + slug + file : null
  // A longer slug is cut and given a hash suffix: find the folder that holds the session.
  const prefix = slug.slice(0, PROJECT_SLUG_MAX) + '-'
  for (const entry of await $.fs.list(projects)) {
    if (entry.kind === 'dir' && entry.name.startsWith(prefix) && (await $.fs.exists(projects + entry.name + file))) {
      return projects + entry.name + file
    }
  }
  return null
}

// Once a second: redraw when the countdown or the panel changed, and let him
// walk on once the panel has closed.
async function tick($: Dollar) {
  const now = await $.clock.now()
  const p = await read($, panel)
  const isMoving = now - p.changedAt < MOTION_MS
  const key = `${readoutKey(readout(await read($, cache), now))}|${p.isOpen}|${isMoving}`
  if (p.isOpen !== pet.wasOpen) {
    pet.wasOpen = p.isOpen
    if (!p.isOpen && pet.isEnabled) void act($)
  }
  if (key === pet.drawnKey) return
  pet.drawnKey = key
  $.ui.invalidate('ui.render')
}

function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

async function cacheStatus($: Dollar): Promise<string> {
  const c = await read($, cache)
  const now = await $.clock.now()
  const r = readout(c, now)
  const source = { set: 'set with /pet cache', transcript: 'from the transcript', remembered: 'from an earlier session', default: 'default' }[r.ttlSource]
  const head = `Prompt cache TTL ${r.ttl} (${source})`
  if (c.lastHit === null) return `${head} · no request yet in this conversation`
  const state = r.left > 0 ? `${clockText(r.left)} left` : 'cold: the next message writes the cache again'
  return `${head} · last request ${clockText(now - c.lastHit)} ago · ${state}`
}

// The panel and the handoff ------------------------------------------------

async function setPanelOpen($: Dollar, isOpen: boolean) {
  const now = await $.clock.now()
  await update($, panel, (p): PetPanel => {
    if (p.isOpen === isOpen) return p
    // Closing leaves a handoff under way alone; it was only the confirm step.
    const phase = isOpen || p.phase === 'writing' || p.phase === 'sending' ? p.phase : 'idle'
    return { ...p, isOpen, changedAt: now, phase, note: phase === 'idle' ? '' : p.note }
  })
}

async function setPhase($: Dollar, phase: PetPanel['phase'], note = '') {
  await update($, panel, (p): PetPanel => ({ ...p, phase, note }))
}

function whyNoBrief(r: { reason: string; status?: number }): string {
  switch (r.reason) {
    case 'nothing-to-fork':
      return 'Nothing to hand off yet: this conversation has no reply.'
    case 'api-error':
      return `Couldn't write the brief (API error${r.status ? ' ' + r.status : ''}). Nothing was cleared.`
    case 'empty-reply':
      return 'The brief came back empty. Nothing was cleared.'
    default:
      return 'Writing the brief was interrupted. Nothing was cleared.'
  }
}

// Writes a brief of this conversation over its own cached transcript (the one
// model call the pet ever makes, and only on the person's say-so), starts a
// fresh conversation with /clear, and sends the brief as its first message.
async function handOff($: Dollar) {
  const p = await read($, panel)
  if (p.phase !== 'confirm') return
  await setPhase($, 'writing')
  const r = await $.model.fork({ prompt: BRIEF_PROMPT }).catch(() => null)
  if (!r) return setPhase($, 'error', "Couldn't write the brief. Nothing was cleared.")
  if (!r.isAnswered) return setPhase($, 'error', whyNoBrief(r as { reason: string; status?: number }))
  const brief = HANDOFF_INTRO + r.text.trim()
  await setPhase($, 'sending')
  try {
    await $.command.run({ command: 'clear', args: '' })
  } catch {
    // The conversation stays as it was: leave the brief in the prompt box instead.
    await $.prompt.fill({ text: brief }).catch(() => null)
    return setPhase($, 'error', "Couldn't start fresh, so the brief is in your prompt box: run /clear, then send it.")
  }
  await update($, cache, c => ({ ...c, lastHit: null, detected: null }))
  await update($, panel, (): PetPanel => ({ isOpen: false, changedAt: 0, phase: 'idle', note: '' }))
  await $.prompt.submit({ text: brief })
}

const drawings = new Map<string, PetDrawing>()

function drawingOf(v: PetView, isReducedMotion: boolean, stripPx: number): PetDrawing {
  const { mood, variant, seq } = v
  const strip = { px: stripPx, from: v.from ?? 0, to: v.to ?? 0 }
  const key = `${mood}:${variant}:${isReducedMotion}:${strip.px}:${strip.from}:${strip.to}`
  let d = drawings.get(key)
  if (!d) {
    if (drawings.size > 48) drawings.clear()
    drawings.set(key, (d = drawPet(mood, { variant, reducedMotion: isReducedMotion, strip })))
  }
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
      description: 'Claudeagotchi: show or hide the pet (on, off, panel, cache, motion, preview, status)',
      argumentHint: '[on|off|panel|cache [5m|1h|auto]|motion|preview|status]',
      immediate: true,
    })
    await loadCacheChoices($)
    // After a reload or a resume, pick the countdown up from the transcript.
    await learnFromTranscript($, (await transcriptPath($).catch(() => null)) ?? undefined)
    pet.ticker?.cancel()
    pet.ticker = $.clock.every(1000, () => void tick($))
    return next(e)
  })

  // Startup, /resume, /clear and compaction, with the transcript's path.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await update($, cache, c => ({ ...c, lastHit: null, detected: null }))
    await loadCacheChoices($)
    await learnFromTranscript($, e.transcript_path)
    return next(e)
  })

  // Claude finished answering: the transcript now holds the turn's cache writes.
  on('classic.Stop', async ($, e, next) => {
    await learnFromTranscript($, e.transcript_path)
    return next(e)
  })

  // A /clear starts a conversation with nothing of it cached.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, cache, c => ({ ...c, lastHit: null, detected: null }))
    return next(e)
  })

  // Each request of the main conversation reads or writes its cache, which
  // restarts the TTL. A subagent caches its own prompt, so it is left out.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const sentAt = await $.clock.now()
    const result = yield* next(e)
    if (result.usage) await update($, cache, c => ({ ...c, lastHit: Math.max(c.lastHit ?? 0, sentAt) }))
    return result
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const s = await read($, settings)
    const [word = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (word === 'cache') {
      if (arg === '5m' || arg === '1h') {
        const ttl: PetTtl = arg
        await $.store.set('cacheTtl', ttl)
        await update($, cache, c => ({ ...c, override: ttl }))
      } else if (arg === 'auto') {
        await $.store.delete('cacheTtl')
        await update($, cache, c => ({ ...c, override: null }))
      } else if (arg) {
        return { text: 'Usage: /pet cache [5m|1h|auto]' }
      }
      $.ui.invalidate('ui.render')
      return { text: await cacheStatus($) }
    }
    if (word === 'panel') {
      const isOpen = !(await read($, panel)).isOpen
      await setPanelOpen($, isOpen)
      return { text: isOpen ? 'Panel open.' : 'Panel closed.' }
    }
    switch (word) {
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
        if (pet.isPreviewing) {
          await stopPreview($)
          return { text: 'Preview stopped.' }
        }
        await startPreview($)
        return { text: 'Previewing every Claudeagotchi state, about a minute. /pet preview again stops it.' }
      case 'status':
        return {
          text: `Claudeagotchi is ${s.isEnabled ? 'shown' : 'hidden'}, ${s.isReducedMotion ? 'in still poses' : 'animated'}, now ${pet.t.shown}.`,
        }
      default:
        return { text: 'Usage: /pet [on|off|panel|cache [5m|1h|auto]|motion|preview|status]. /pet alone shows or hides him.' }
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
      pet.progress = freshProgress() // a new task: back to the left end
      t.isTurn = true
      t.lastActive = now
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    const reason = e.reason
    void act($, (t, now) => {
      endTurn(t, agentId, reason, now)
      if (!agentId && reason === 'answer') pet.progress.isDone = true // all the way across
    })
    return next(e)
  })

  // Never waits on its own bookkeeping before the tool runs, and returns the
  // tool's answer exactly as the chain gave it.
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `own-${pet.nextId++}`
    const tool = String(e.tool)
    const agentId = e.agentId
    const { activity } = classify(tool, e as unknown as Record<string, unknown>)
    const input = e as unknown as Record<string, unknown>
    void act($, (t, now) => {
      startCall(t, id, tool, activity, agentId, now)
      noteCall(pet.progress, tool, input)
    })
    let launched: string | undefined
    try {
      const result = await next(e)
      // An agent sent to the background keeps working after its call returns.
      const record = (result.result ?? {}) as { status?: unknown; agentId?: unknown }
      if (record.status === 'async_launched' && typeof record.agentId === 'string') launched = record.agentId
      return result
    } finally {
      void act($, (t, now) => {
        endCall(t, id, now)
        if (launched) t.agents.add(launched)
      })
    }
  }).catch(($, e, next) => next(e))

  // The permission check runs inside the call, before any dialog: an allowed
  // call shows at once, one that asks waits for its dialog to claim it.
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    const id = e.tool_use_id
    const decision = result.decision
    if (id) void act($, t => checkCall(t, id, decision))
    return result
  })

  // A permission dialog is about to be shown, unless a settings hook decided.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    const tool = e.tool_name
    const agentId = e.agent_id
    if (!result.decision) void act($, t => openDialog(t, tool, agentId))
    return result
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    const id = e.tool_use_id
    void act($, t => denyCall(t, id))
    return next(e)
  })

  // Success and failure are judged only for commands that actually ran: a
  // refused or blocked call raises neither of these.
  on('classic.PostToolUse', async ($, e, next) => {
    const { verifies } = classify(e.tool_name, (e.tool_input ?? {}) as Record<string, unknown>)
    if (verifies && !wasBackgrounded(e.tool_response)) void act($, (t, now) => flash(t, 'success', now))
    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    const { verifies } = classify(e.tool_name, (e.tool_input ?? {}) as Record<string, unknown>)
    if (verifies && !e.is_interrupt) void act($, (t, now) => flash(t, 'error', now))
    return next(e)
  })

  on('classic.Elicitation', async ($, e, next) => {
    const result = await next(e)
    if (!result.block && !result.preventContinuation) {
      void act($, t => {
        t.elicitations++
      })
    }
    return result
  })

  on('classic.ElicitationResult', async ($, e, next) => {
    void act($, t => {
      t.elicitations = Math.max(0, t.elicitations - 1)
    })
    return next(e)
  })

  // Only the desktop draws vector art in this band; the terminal keeps it.
  on('ui.render', { component: 'AbovePrompt', surface: 'desktop' }, async ($, e, next) => {
    const below = await next(e)
    const { isEnabled, isReducedMotion } = await read($, settings)
    const v = await read($, view)
    if ((!isEnabled && !v.preview) || e.props.hasSurvey) return below
    // After a reload mid-turn the counts start empty; the band knows better.
    if (e.props.isWorking && !pet.t.isTurn && !pet.isWorkingPending) {
      pet.isWorkingPending = true
      $.clock.after(1, () => {
        pet.isWorkingPending = false
        void act($, t => {
          t.isTurn = true
        })
      })
    }
    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    pet.stripPx = Math.max(156, Math.round((e.props.bodyColumns - BUTTON_COLUMNS) * PX_PER_COLUMN))
    const d = drawingOf(v, isReducedMotion, pet.stripPx)
    const now = await $.clock.now()
    const r = readout(await read($, cache), now)
    const p = await read($, panel)
    // The panel grows out of him while it opens and shrinks back as it closes.
    const sinceChange = now - p.changedAt
    const motion: PanelMotion | null = p.isOpen ? (sinceChange < MOTION_MS ? 'opening' : 'open') : sinceChange < MOTION_MS ? 'closing' : null
    const overlay = motion && drawPanel({ px: pet.stripPx, to: v.to ?? 0, readout: r, motion, reducedMotion: isReducedMotion })
    const toggle = () => void setPanelOpen($, !p.isOpen)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="flex-end">
          <Box position="relative">
            <Svg source={d.source} alt={d.alt} width={d.width} height={d.height} isInteractive={d.isAnimated} />
            {overlay && (
              <Box position="absolute" top={0} left={0}>
                <Svg source={overlay.source} alt={`Prompt cache: ${r.label}`} width={overlay.width} height={overlay.height} />
              </Box>
            )}
          </Box>
          <Button key="claudeagotchi-panel" label={`${r.glyph} ${r.label}`} dimColor={r.level !== 'red'} onPress={toggle} />
          {v.preview && <Text dimColor> preview: {v.preview}</Text>}
        </Box>
        {p.isOpen && (
          <Box flexDirection="row" columnGap={1} justifyContent={overlay?.place?.side === 'left' ? 'flex-start' : 'flex-end'} width={e.props.bodyColumns}>
            {p.phase === 'confirm' ? (
              <>
                <Text>Start fresh with handoff?</Text>
                <Button key="claudeagotchi-handoff-yes" label="Start fresh" variant="primary" autoFocus onPress={() => void handOff($)} />
                <Button key="claudeagotchi-handoff-no" label="Cancel" role="dismiss" onPress={() => void setPhase($, 'idle')} />
              </>
            ) : p.phase === 'writing' ? (
              <Text dimColor>Writing the handoff brief…</Text>
            ) : p.phase === 'sending' ? (
              <Text dimColor>Starting a fresh session…</Text>
            ) : p.phase === 'error' ? (
              <>
                <Text color="warning">{p.note}</Text>
                <Button key="claudeagotchi-handoff-ok" label="OK" onPress={() => void setPhase($, 'idle')} />
              </>
            ) : e.props.isWorking ? (
              <Text dimColor>Handoff is ready once Claude finishes.</Text>
            ) : (
              <Button key="claudeagotchi-handoff" label="Hand off to a fresh session" onPress={() => void setPhase($, 'confirm')} />
            )}
          </Box>
        )}
        {below}
      </Box>
    )
  })
}
