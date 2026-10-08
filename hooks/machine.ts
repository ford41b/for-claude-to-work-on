// What Claudeagotchi should be doing, decided from what the session is doing.
// Pure: events change a Tracker through the functions below, `decide` reads
// it at a time and says which mood to show and when to ask again. No timers
// or engine calls live here.

import { playMs, type Mood } from './sprites'

export type Activity = 'edit' | 'read' | 'search' | 'run' | 'ask' | 'other'

export type Call = {
  tool: string
  activity: Activity
  agentId?: string
  startedAt: number
  isChecked: boolean // its permission check allowed it to run
  isWaiting: boolean // its permission dialog is open
}

export type Tracker = {
  calls: Map<string, Call> // tool calls in flight, by tool_use_id
  strays: { tool: string; agentId?: string }[] // dialogs no call in flight matched
  elicitations: number // MCP servers waiting on a form
  isTurn: boolean // the main loop is working on a prompt
  agents: Set<string> // subagent loops seen working
  flash?: { mood: 'success' | 'error'; until: number }
  owed?: number // an edit finished unseen: typing is owed until then
  lastActive: number
  shown: Mood
  shownAt: number
}

export function tracker(now: number): Tracker {
  return {
    calls: new Map(),
    strays: [],
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
export const OWED_MS = 3000
// A call shows once its permission check allows it; one that is never checked
// shows after this. Long enough for a permission dialog to claim it first.
export const CHECK_GRACE_MS = 250

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
const ORDER: Activity[] = ['edit', 'run', 'search', 'read', 'other']

const isShowable = (c: Call, now: number) => c.isChecked || now - c.startedAt >= CHECK_GRACE_MS

// What the session wants shown right now, ignoring how long the current mood
// has been up.
function wanted(t: Tracker, now: number): Mood {
  const calls = [...t.calls.values()]
  if (t.strays.length > 0 || t.elicitations > 0) return 'attention'
  if (calls.some(c => c.isWaiting || c.activity === 'ask')) return 'attention'
  if (t.flash && now < t.flash.until) return t.flash.mood
  const busy = new Set(calls.filter(c => isShowable(c, now)).map(c => c.activity))
  if (t.owed !== undefined && now < t.owed) busy.add('edit')
  const top = ORDER.find(a => busy.has(a))
  if (top) return FOR[top]
  if (t.isTurn || t.agents.size > 0 || calls.length > 0) return 'thinking'
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
    ...[...t.calls.values()].filter(c => !isShowable(c, now)).map(c => c.startedAt + CHECK_GRACE_MS),
  ].filter(at => at > now)
  return { mood, nextAt: candidates.length ? Math.min(...candidates) : Infinity }
}

// ---------------------------------------------------------------- events

export function startCall(t: Tracker, id: string, tool: string, activity: Activity, agentId: string | undefined, now: number) {
  t.lastActive = now
  if (agentId) t.agents.add(agentId)
  t.calls.set(id, { tool, activity, agentId, startedAt: now, isChecked: false, isWaiting: false })
}

// The permission check's verdict: `allow` runs at once, `ask` may open a
// dialog (or go to Auto mode's classifier), `deny` never runs.
export function checkCall(t: Tracker, id: string, decision: 'allow' | 'ask' | 'deny') {
  const call = t.calls.get(id)
  if (!call) return
  if (decision === 'allow') call.isChecked = true
  if (decision === 'deny') t.calls.delete(id)
}

// A permission dialog opened. It carries no call id, so it belongs to the
// newest unchecked call of that tool in that loop.
export function openDialog(t: Tracker, tool: string, agentId: string | undefined) {
  const call = [...t.calls.values()]
    .filter(c => c.tool === tool && c.agentId === agentId && !c.isWaiting && !c.isChecked)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  if (call) call.isWaiting = true
  else t.strays.push({ tool, agentId })
}

// Nothing marks the moment a dialog is approved, so a wait ends when its call
// does, when it is denied, or when its turn ends: never while still open.
export function denyCall(t: Tracker, id: string) {
  t.calls.delete(id)
}

export function endCall(t: Tracker, id: string, now: number) {
  const call = t.calls.get(id)
  t.lastActive = now
  t.calls.delete(id)
  if (!call) return
  t.strays = t.strays.filter(s => !(s.tool === call.tool && s.agentId === call.agentId))
  // An edit that ran while something else was on screen (a celebration, a
  // question, an error) still earns a short spell of typing afterwards.
  if (call.activity === 'edit' && t.shown !== 'coding') {
    const from = t.flash && now < t.flash.until ? t.flash.until : now
    t.owed = from + OWED_MS
  }
}

export function endTurn(t: Tracker, agentId: string | undefined, reason: string, now: number) {
  t.lastActive = now
  const mine = (a?: string) => a === agentId
  for (const [id, call] of t.calls) if (mine(call.agentId)) t.calls.delete(id)
  t.strays = t.strays.filter(s => !mine(s.agentId))
  if (agentId) {
    t.agents.delete(agentId)
    return
  }
  t.isTurn = false
  t.elicitations = 0
  // An API failure or a refusal is a confirmed failure; an interrupt is not,
  // and a turn that simply ended says nothing about success.
  if (reason === 'error' || reason === 'refusal') flash(t, 'error', now)
}

export function flash(t: Tracker, mood: 'success' | 'error', now: number) {
  t.flash = { mood, until: now + FLASH_MS[mood] }
}

// ---------------------------------------------------------------- tools

const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ = new Set(['Read', 'NotebookRead', 'WebFetch'])
const SEARCH = new Set(['Grep', 'Glob', 'LS', 'WebSearch', 'ToolSearch', 'LSP'])
const RUN = new Set(['Bash', 'PowerShell', 'BashOutput', 'TaskOutput', 'KillShell', 'Monitor'])
const ASK = new Set(['AskUserQuestion', 'ExitPlanMode'])

// A command with its quoted strings and heredoc bodies blanked out, so text
// inside them (a `>` in a regex, `test` in a message) is never read as shell.
function bare(command: string): string {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '<<H$3')
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")
}

// Shell commands that write files count as coding; ones that only look count
// as reading or searching. A guess from the command's text, never its effect.
const WRITES = /(^|[\s;&|(])(sed\s+-i|perl\s+-pi|tee|patch|apply_patch)\b|(^|[^0-9&>])>{1,2}\s*(?!&|\/dev\/null)[\w./~$'-]/
const SEARCHES = /^\s*(grep|rg|ag|find|fd|git\s+grep)\b/
const READS = /^\s*(cat|head|tail|less|more|ls|tree|wc|file|stat|du|sed\s+-n|git\s+(log|show|diff|status|blame))\b/

// Builds, tests, linters and type checks, matched as the program that runs.
const RUNNERS =
  /^(jest|vitest|pytest|py\.test|mocha|rspec|phpunit|ctest|tox|nox|tsc|eslint|ruff|mypy|pyright|flake8|make|\.?\/?gradlew|gradle|\.?\/?mvnw|mvn|xcodebuild|swift\s+(build|test)|cargo\s+(test|build|check|clippy|nextest)|go\s+(test|build|vet)|dotnet\s+(test|build)|deno\s+(test|check|lint)|bun\s+test|npm\s+t|(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck|type-check|check)(:\S*)?|claude\s+plugin\s+(test|validate))(\s|$)/
const PREFIXES = /^((\w+=\S*|env|time|npx|bunx|pnpm\s+(exec|dlx)|yarn\s+dlx|uv\s+run|poetry\s+run|python3?\s+-m)\s+)+/

// Whether the command's exit status is a build, test or check's own verdict:
// some `&&` step runs one, and no pipe, `||`, `;` or background `&` lets
// another command decide the status instead.
export function isVerifyCommand(command: string): boolean {
  const plain = bare(command).replace(/\d*>&\d*|&>>?/g, ' ').replace(/&&/g, '\u0000')
  if (/[|;&\n]/.test(plain)) return false
  return plain.split('\u0000').some(step => RUNNERS.test(step.trim().replace(PREFIXES, '')))
}

export function classify(tool: string, input: Record<string, unknown>): { activity: Activity; verifies: boolean } {
  if (EDIT.has(tool)) return { activity: 'edit', verifies: false }
  if (READ.has(tool)) return { activity: 'read', verifies: false }
  if (SEARCH.has(tool)) return { activity: 'search', verifies: false }
  if (ASK.has(tool)) return { activity: 'ask', verifies: false }
  if (RUN.has(tool)) {
    const command = typeof input.command === 'string' ? input.command : ''
    const plain = bare(command)
    if (WRITES.test(plain)) return { activity: 'edit', verifies: false }
    if (SEARCHES.test(plain)) return { activity: 'search', verifies: false }
    if (READS.test(plain) && !/[;&|]/.test(plain)) return { activity: 'read', verifies: false }
    const isForeground = (tool === 'Bash' || tool === 'PowerShell') && input.run_in_background !== true
    return { activity: 'run', verifies: isForeground && isVerifyCommand(command) }
  }
  return { activity: 'other', verifies: false }
}

// Whether a finished command was moved to the background, so its exit says
// nothing yet about the work.
export function wasBackgrounded(response: unknown): boolean {
  const r = (response ?? {}) as { backgroundTaskId?: unknown; backgroundedByUser?: unknown; timedOutAfterMs?: unknown }
  return !!(r.backgroundTaskId || r.backgroundedByUser || r.timedOutAfterMs)
}

// ---------------------------------------------------------------- progress

// How far along the current task is, from 0 (just asked) to 1 (answered).
// Claude's own task list is the measure when it keeps one; otherwise each
// step creeps him forward, never past most of the way, until the answer.
export type Progress = {
  steps: number
  todos: { status: string }[] // the latest TodoWrite list
  tasks: Map<string, string> // task list entries by id, with their status
  created: number // tasks created this turn
  isDone: boolean
}

export function freshProgress(): Progress {
  return { steps: 0, todos: [], tasks: new Map(), created: 0, isDone: false }
}

const STEP_CREEP = 5 // steps to cover about two thirds of the creep
const CREEP_MAX = 0.85
const LIST_MAX = 0.95 // a finished list still waits for the answer

export function progressOf(p: Progress): number {
  if (p.isDone) return 1
  const statuses = p.todos.length > 0 ? p.todos.map(t => t.status) : [...p.tasks.values()]
  const total = p.todos.length > 0 ? p.todos.length : Math.max(p.created, p.tasks.size)
  if (total > 0) {
    const done = statuses.filter(s => s === 'completed').length
    const doing = statuses.filter(s => s === 'in_progress').length
    return Math.min(LIST_MAX, ((done + doing / 2) / total) * LIST_MAX)
  }
  return CREEP_MAX * (1 - Math.exp(-p.steps / STEP_CREEP))
}

// What a tool call says about progress: a step, and the task list it changes.
export function noteCall(p: Progress, tool: string, input: Record<string, unknown>) {
  p.steps++
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    p.todos = input.todos.map(t => ({ status: String((t as { status?: unknown }).status ?? 'pending') }))
  }
  if (tool === 'TaskCreate') p.created++
  if (tool === 'TaskUpdate' && typeof input.taskId === 'string' && typeof input.status === 'string') {
    p.tasks.set(input.taskId, input.status)
  }
}
