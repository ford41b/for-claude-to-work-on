export type PetMood =
  | 'idle'
  | 'thinking'
  | 'coding'
  | 'reading'
  | 'searching'
  | 'running'
  | 'success'
  | 'attention'
  | 'error'
  | 'resting'
  | 'waking'
  | 'unpacking'

// What the band draws: the mood, which idle variant, a counter that restarts
// one-shot animations, and the mood a preview is showing (null outside one).
export type PetView = { mood: PetMood; variant: number; seq: number; preview: PetMood | null }

// The person's choices, mirrored from the plugin's store so they persist.
export type PetSettings = { isEnabled: boolean; isReducedMotion: boolean }

// The prompt cache's time to live.
export type PetTtl = '5m' | '1h'

// The main conversation's prompt cache: when a request last used it (null
// before any, and again after /clear), the TTL the transcript reported, the
// one set with /pet cache, and the last one any session saw.
export type PetCache = { lastHit: number | null; detected: PetTtl | null; override: PetTtl | null; remembered: PetTtl | null }

// The handoff row under him, opened by the cache button: open or not, and
// where the handoff stands.
export type PetPanelPhase = 'idle' | 'confirm' | 'writing' | 'sending' | 'error'
export type PetPanel = { isOpen: boolean; phase: PetPanelPhase; note: string }

// The progress bars' plans (from plan-progress, see hooks/progress.tsx).
export type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'
export type PlanSubstep = { title: string; status: StepStatus }
// doneAt: when the step was finished, so a checkpoint can tell how long it took
export type PlanStep = { title: string; status: StepStatus; substeps: PlanSubstep[]; doneAt?: number }
export type PlanStage = { name: string; steps: PlanStep[] }
export type PlanState = 'running' | 'needs_input' | 'error' | 'done'
// one subagent shown as a state strip under a bar; depth 1 sits under its parent agent
export type AgentRun = {
  id: string
  title: string
  state: 'running' | 'waiting' | 'done' | 'error'
  tool: string
  startedAt: number
  endedAt: number | null
  depth: number
  // the model it runs on and its effort, as the engine resolved them
  model?: string
  effort?: string
}
export type Plan = {
  id: string
  title: string
  kind: 'plan' | 'todo'
  stages: PlanStage[]
  state: PlanState
  note: string | null
  startedAt: number
  // when the plan was finished; the pill then shows the time it took
  endedAt?: number | null
  agents?: AgentRun[]
  // when the current batch of agents all finished; their strips fold a few seconds later
  agentsDoneAt?: number | null
  // the person folded the bar's agent strips away (its ▾ button, /progress-agents); the bar keeps one line
  isFolded?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    claudeagotchi: {
      view: PetView
      settings: PetSettings
      cache: PetCache
      panel: PetPanel
      // the progress bars, whether they are shown, and a count bumped every second while agents run
      plans: Plan[]
      progressOpen: boolean
      progressTick: number
    }
  }
}
