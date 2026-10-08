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
// one-shot animations, the mood a preview is showing (null outside one), and
// where on the strip he walks from and to (0 the left end, 1 the right).
export type PetView = { mood: PetMood; variant: number; seq: number; preview: PetMood | null; from: number; to: number }

// The person's choices, mirrored from the plugin's store so they persist.
export type PetSettings = { isEnabled: boolean; isReducedMotion: boolean }

// The prompt cache's time to live.
export type PetTtl = '5m' | '1h'

// The main conversation's prompt cache: when a request last used it (null
// before any, and again after /clear), the TTL the transcript reported, the
// one set with /pet cache, and the last one any session saw.
export type PetCache = { lastHit: number | null; detected: PetTtl | null; override: PetTtl | null; remembered: PetTtl | null }

// The info panel beside him: open or not, when that last changed (for its
// grow and shrink), and where the handoff stands.
export type PetPanelPhase = 'idle' | 'confirm' | 'writing' | 'sending' | 'error'
export type PetPanel = { isOpen: boolean; changedAt: number; phase: PetPanelPhase; note: string }

declare module 'claude-code' {
  interface PluginState {
    claudeagotchi: { view: PetView; settings: PetSettings; cache: PetCache; panel: PetPanel }
  }
}
