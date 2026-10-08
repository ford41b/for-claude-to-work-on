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

declare module 'claude-code' {
  interface PluginState {
    claudeagotchi: { view: PetView; settings: PetSettings; cache: PetCache; panel: PetPanel }
  }
}
