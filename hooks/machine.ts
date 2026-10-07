// What Claudeagotchi should be doing, decided from what the session is doing.
// Pure: events mutate a Tracker, `decide` reads it at a time and says which
// mood to show and when to ask again. No timers or engine calls live here.

import { playMs, type Mood } from './sprites'

export type Activity = 'edit' | 'read' | 'search' | 'run' | 'ask' | 'other'

export type Tracker = {
  calls: Map<string, { activity: Activity; agentId?: string }> // tool calls in flight
  permissions: string[] // tools whose permission dialog is open ('*' when unnamed)
  elicitations: number // MCP servers waiting on a form
  isTurn: boolean // the main loop is working on a prompt
  agents: Set<string> // subagent loops seen working
  flash?: { mood: 'success' | 'error'; until: number }
  owed?: number // an edit finished unseen: typing is still owed until then
  lastActive: number
  shown: Mood
  shownAt: number
}

export function tracker(now: number): Tracker {
  return {
    calls: new Map(),
    permissions: [],
    elicitations: 0,
    isTurn: false,
    agents: new Set(),
    lastActive: now,
    shown: 'idle',
    shownAt: now,
  }
}

// How long a brief activity stays on screen at least, so a quick edit still
// gets a proper bit of typing and fast tool calls do not flicker.
export const DWELL: Partial<Record<Mood, number>> = {
  coding: 4200,
  running: 1600,
  reading: 1400,
  searching: 1400,
  thinking: 900,
}
export const FLASH_MS = { success: 1900, error: 4500 }
export const REST_AFTER_MS = 3 * 60_000

const RANK: Partial<Record<Mood, number>> = {
  coding: 4,
  running: 3,
  reading: 2,
  searching: 2,
  thinking: 1,
  idle: 0,
  resting: -1,
}
const FOR: Record<Activity, Mood> = {
  ask: 'attention',
  edit: 'coding',
  run: 'running',
  read: 'reading',
  search: 'searching',
  other: 'thinking',
}
const ORDER: Activity[] = ['ask', 'edit', 'run', 'search', 'read', 'other']

// What the session wants shown right now, ignoring how long the current mood
// has been up.
function wanted(t: Tracker, now: number): Mood {
  if (t.permissions.length > 0 || t.elicitations > 0) return 'attention'
  const busy = new Set([...t.calls.values()].map(c => c.activity))
  if (busy.has('ask')) return 'attention'
  if (t.flash && now < t.flash.until) return t.flash.mood
  if (t.owed !== undefined && now < t.owed) busy.add('edit')
  const top = ORDER.find(a => busy.has(a))
  if (top) return FOR[top]
  if (t.isTurn || t.agents.size > 0) return 'thinking'
  return now - t.lastActive >= REST_AFTER_MS ? 'resting' : 'idle'
}

const isUrgent = (m: Mood) => m === 'attention' || m === 'error'

export type Decision = { mood: Mood; nextAt: number }

export function decide(t: Tracker, now: number): Decision {
  const want = wanted(t, now)
  const since = t.shownAt
  const cur = t.shown
  let mood = want

  if (want !== cur && !isUrgent(want)) {
    const dwellEnd = since + (DWELL[cur] ?? 0)
    const transitionEnd = since + playMs(cur)
    if ((cur === 'unpacking' || cur === 'waking') && now < transitionEnd) {
      // Let the short transition finish, unless he is going straight back to typing.
      mood = cur === 'unpacking' && want === 'coding' ? 'coding' : cur
    } else if (now < dwellEnd && (RANK[want] ?? 9) <= (RANK[cur] ?? 9)) {
      mood = cur // a step down waits out the minimum display time
    } else if (cur === 'coding') {
      mood = 'unpacking' // put the computer away first
    } else if (cur === 'resting') {
      mood = 'waking'
    }
  }

  // When to look again: the end of whatever is holding the current mood.
  const shownSince = mood === cur ? since : now
  const candidates = [
    shownSince + (DWELL[mood] ?? 0),
    mood === 'unpacking' || mood === 'waking' ? shownSince + playMs(mood) : Infinity,
    t.flash && now < t.flash.until ? t.flash.until : Infinity,
    t.owed !== undefined && now < t.owed ? t.owed : Infinity,
    mood === 'idle' ? t.lastActive + REST_AFTER_MS : Infinity,
  ].filter(at => at > now)
  return { mood, nextAt: candidates.length ? Math.min(...candidates) : Infinity }
}

// ---------------------------------------------------------------- tools

const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ = new Set(['Read', 'NotebookRead', 'WebFetch'])
const SEARCH = new Set(['Grep', 'Glob', 'LS', 'WebSearch', 'ToolSearch', 'LSP'])
const RUN = new Set(['Bash', 'PowerShell', 'BashOutput', 'TaskOutput', 'KillShell', 'Monitor'])
const ASK = new Set(['AskUserQuestion', 'ExitPlanMode'])

// Shell commands that write files count as coding; ones that only look count
// as reading or searching. A guess from the command's text, never its effect.
const WRITES = /(^|[\s;&|(])(sed\s+-i|perl\s+-pi|tee|patch|apply_patch)\b|(^|[^0-9&>])>{1,2}\s*(?!&|\/dev\/null)[\w./~$"'-]/
const SEARCHES = /^\s*(grep|rg|ag|find|fd|git\s+grep)\b/
const READS = /^\s*(cat|head|tail|less|more|ls|tree|wc|file|stat|du|git\s+(log|show|diff|status|blame))\b/

// Builds, tests, linters and type checks: the commands whose exit says
// whether the work succeeded.
const VERIFIES =
  /\b(test|tests|spec|jest|vitest|pytest|mocha|rspec|phpunit|ctest|tox|tsc|typecheck|lint|eslint|ruff|mypy|clippy|build|make|cargo|gradlew?|mvn|dotnet|xcodebuild)\b/

export function classify(tool: string, input: Record<string, unknown>): { activity: Activity; verifies: boolean } {
  if (EDIT.has(tool)) return { activity: 'edit', verifies: false }
  if (READ.has(tool)) return { activity: 'read', verifies: false }
  if (SEARCH.has(tool)) return { activity: 'search', verifies: false }
  if (ASK.has(tool)) return { activity: 'ask', verifies: false }
  if (RUN.has(tool)) {
    const command = typeof input.command === 'string' ? input.command : ''
    if (WRITES.test(command)) return { activity: 'edit', verifies: false }
    if (SEARCHES.test(command)) return { activity: 'search', verifies: false }
    if (READS.test(command) && !/[;&|]/.test(command)) return { activity: 'read', verifies: false }
    return { activity: 'run', verifies: tool !== 'BashOutput' && VERIFIES.test(command) }
  }
  return { activity: 'other', verifies: false }
}

// A tool result as `tool.call` sees it, reduced to what the pet cares about.
export type Outcome = { isDenied: boolean; isError: boolean; text?: string }

export function verdict(outcome: Outcome): 'success' | 'error' | undefined {
  if (outcome.isDenied) return undefined
  if (outcome.isError) return /interrupted/i.test(outcome.text ?? '') ? undefined : 'error'
  return 'success'
}

// An edit that started and finished while something else was on screen
// (a celebration, a question) still earns a short spell of typing.
export const OWED_MS = 3000

export function finishEdit(t: Tracker, now: number, isShowing: boolean) {
  if (!isShowing) t.owed = now + OWED_MS
}

// The permission waits a tool call answers: its own and any unnamed one.
export function answerPermission(t: Tracker, tool: string) {
  t.permissions = t.permissions.filter(p => p !== tool && p !== '*')
}
