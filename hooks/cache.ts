// The prompt cache's countdown, after the Cache TTL Timer mod: the main
// conversation's cache entry lives for its TTL after the last request that
// used it. The TTL (5m or 1h) is read from the transcript, where the API's
// usage says how many tokens each request wrote at either TTL.

import type { PetCache, PetTtl } from '../types'

export const TTL_MS: Record<PetTtl, number> = { '5m': 5 * 60 * 1000, '1h': 60 * 60 * 1000 }
// Until any transcript has said otherwise.
export const DEFAULT_TTL: PetTtl = '5m'
// Shares of the TTL left where the color turns yellow, then red.
const YELLOW_AT = 0.5
const RED_AT = 0.2
// How many steps the bar drains in, so it redraws a few times a minute at most.
export const BAR_STEPS = 40
// The ring on the panel's button, full to nearly empty, and once cold.
const GLYPHS = ['●', '◕', '◑', '◔', '○']
const COLD_GLYPH = '◌'

export type CacheLevel = 'none' | 'green' | 'yellow' | 'red' | 'cold'

export type Readout = {
  level: CacheLevel
  ttl: PetTtl
  ttlSource: 'set' | 'transcript' | 'remembered' | 'default'
  left: number // ms until cold; 0 once cold, the whole TTL before any request
  total: number
  step: number // 0..BAR_STEPS, how much of the bar is still lit
  label: string // 47m, 0:42, Cold, or — before any request
  glyph: string
}

export function ttlOf(c: PetCache): { ttl: PetTtl; source: Readout['ttlSource'] } {
  if (c.override) return { ttl: c.override, source: 'set' }
  if (c.detected) return { ttl: c.detected, source: 'transcript' }
  if (c.remembered) return { ttl: c.remembered, source: 'remembered' }
  return { ttl: DEFAULT_TTL, source: 'default' }
}

export function readout(c: PetCache, now: number): Readout {
  const { ttl, source } = ttlOf(c)
  const total = TTL_MS[ttl]
  if (c.lastHit === null) {
    return { level: 'none', ttl, ttlSource: source, left: total, total, step: 0, label: '—', glyph: '○' }
  }
  const left = Math.max(0, c.lastHit + total - now)
  const share = left / total
  const level: CacheLevel = left <= 0 ? 'cold' : share <= RED_AT ? 'red' : share <= YELLOW_AT ? 'yellow' : 'green'
  const step = left <= 0 ? 0 : Math.ceil(share * BAR_STEPS)
  const glyph = level === 'cold' ? COLD_GLYPH : GLYPHS[Math.min(GLYPHS.length - 1, Math.round((1 - share) * (GLYPHS.length - 1)))]!
  return { level, ttl, ttlSource: source, left, total, step, label: labelOf(left), glyph }
}

// 47m while there's time, 0:42 in the last minute, Cold after.
function labelOf(left: number): string {
  if (left <= 0) return 'Cold'
  if (left < 60 * 1000) return '0:' + String(Math.ceil(left / 1000)).padStart(2, '0')
  return Math.ceil(left / 60000) + 'm'
}

// The moments the readout changes: what a redraw is keyed on.
export function readoutKey(r: Readout): string {
  return `${r.level}|${r.label}|${r.step}|${r.ttl}`
}

// From transcript lines: when the last main-conversation request was sent,
// and the TTL of the latest cache write.
export function parseTail(text: string): { sentAt: number; ttl: PetTtl | null } | null {
  let sentAt: number | null = null
  let ttl: PetTtl | null = null
  let lastUserAt: number | null = null
  let lastId: unknown = null
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue
    let row: Record<string, any>
    try {
      row = JSON.parse(line)
    } catch {
      continue // the first line of a tail is usually cut
    }
    if (row.isSidechain) continue
    const at = Date.parse(row.timestamp)
    if (Number.isNaN(at)) continue
    // A prompt or a tool result is written just before the request that carries it.
    if (row.type === 'user') {
      lastUserAt = at
      continue
    }
    if (row.type !== 'assistant') continue
    const message = row.message ?? {}
    const usage = message.usage
    if (!usage || message.model === '<synthetic>') continue
    // One response is written as several rows that share its id.
    if (message.id !== lastId) {
      lastId = message.id
      sentAt = lastUserAt ?? at
    }
    const written = usage.cache_creation ?? {}
    if (written.ephemeral_1h_input_tokens > 0) ttl = '1h'
    else if (written.ephemeral_5m_input_tokens > 0) ttl = '5m'
  }
  return sentAt === null ? null : { sentAt, ttl }
}
