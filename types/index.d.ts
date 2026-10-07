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

declare module 'claude-code' {
  interface PluginState {
    claudeagotchi: { view: PetView; settings: PetSettings }
  }
}
