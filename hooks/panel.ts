// The info panel that grows out of Claudeagotchi's body: the prompt cache's
// countdown in the same chunky pixels as he is drawn in. It is a transparent
// drawing the size of his strip, laid over it, so it lines up with him without
// moving him; only the panel itself is painted.

import type { Readout } from './cache'
import { BAR_STEPS } from './cache'
import { BODY_MIDDLE, BODY_SPAN, SCALE, STRIP_HEIGHT, W, stripWidth, stripX } from './sprites'

const COLORS = {
  face: '#2B2B2B',
  rim: '#C7785C', // his own orange: the panel is part of him
  label: '#8C8C96',
  dim: '#5E5E66',
  well: '#3A3A3A',
  green: '#7DBA6A',
  yellow: '#D9B44A',
  red: '#D9573E',
  cold: '#74747E',
} as const
type Ink = keyof typeof COLORS

// A 3x5 pixel font: just the letters the panel says.
const FONT: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['.', '#', '.', '#', '.'],
  '-': ['...', '...', '###', '...', '...'],
  ' ': ['..', '..', '..', '..', '..'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
}

class Canvas {
  runs: Partial<Record<Ink, string[]>> = {}

  rect(x: number, y: number, w: number, h: number, ink: Ink) {
    if (w <= 0 || h <= 0) return
    ;(this.runs[ink] ??= []).push(`M${x} ${y}h${w}v${h}h${-w}z`)
  }

  // Text in the pixel font at `size` art pixels per font pixel.
  text(x: number, y: number, s: string, ink: Ink, size = 1) {
    let at = x
    for (const ch of s) {
      const rows = FONT[ch] ?? FONT[' ']!
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') this.rect(at + i * size, y + j * size, size, size, ink)
      })
      at += (rows[0]!.length + 1) * size
    }
  }

  svg(): string {
    return (Object.keys(this.runs) as Ink[]).map(ink => `<path fill="${COLORS[ink]}" d="${this.runs[ink]!.join('')}"/>`).join('')
  }
}

export function textWidth(s: string, size = 1): number {
  let n = 0
  for (const ch of s) n += ((FONT[ch] ?? FONT[' ']!)[0]!.length + 1) * size
  return Math.max(0, n - size)
}

// The two sizes, in art pixels: the full panel, and a narrower one for small windows.
const FULL_W = 48
const COMPACT_W = 30
const PANEL_H = 24
const PANEL_TOP = 1
const GAP = 2

export type PanelPlace = { x: number; w: number; side: 'left' | 'right' } | null

// Where the panel goes beside him on a strip `px` wide with him at `to`: on
// the side with more room, clear of his whole canvas if it fits, else clear of
// his body and arms; null when the window is too narrow for any panel.
export function placePanel(px: number, to: number): PanelPlace {
  const width = stripWidth(px)
  const stripArt = Math.floor(width / SCALE)
  const petArt = stripX(width, to) / SCALE
  const roomRight = (clearOf: number) => stripArt - (petArt + clearOf) - GAP
  const roomLeft = (clearOf: number) => petArt + clearOf - GAP
  const tries: [number, number, number][] = [
    [W, 0, FULL_W],
    [W, 0, COMPACT_W],
    [BODY_SPAN.right, BODY_SPAN.left, FULL_W],
    [BODY_SPAN.right, BODY_SPAN.left, COMPACT_W],
  ]
  for (const [right, left, w] of tries) {
    const r = roomRight(right)
    const l = roomLeft(left)
    const side = r >= l ? 'right' : 'left'
    if (Math.max(r, l) < w) continue
    return side === 'right' ? { x: petArt + right + GAP, w, side } : { x: petArt + left - GAP - w, w, side }
  }
  return null
}

const LEVEL_INK: Record<Readout['level'], Ink> = { none: 'dim', green: 'green', yellow: 'yellow', red: 'red', cold: 'cold' }

function panelBody(r: Readout, x: number, w: number): string {
  const c = new Canvas()
  const y = PANEL_TOP
  // A face with a rim of his color, corners notched like his own pixels.
  c.rect(x + 1, y, w - 2, PANEL_H, 'rim')
  c.rect(x, y + 1, w, PANEL_H - 2, 'rim')
  c.rect(x + 1, y + 1, w - 2, PANEL_H - 2, 'face')
  const inner = { x: x + 3, w: w - 6 }
  // The bar's groove first, so everything else paints over it.
  const barY = y + PANEL_H - 5
  c.rect(inner.x, barY, inner.w, 2, 'well')
  c.text(inner.x, y + 2, 'CACHE', 'label')
  const ttl = r.ttl === '1h' ? '1H' : '5M'
  if (textWidth('CACHE') + 4 + textWidth(ttl) <= inner.w) c.text(inner.x + inner.w - textWidth(ttl), y + 2, ttl, 'dim')
  const ink = LEVEL_INK[r.level]
  const big = r.level === 'none' ? '--' : r.level === 'cold' ? 'COLD' : r.label.toUpperCase()
  c.text(inner.x, y + 8, big, ink, 2)
  // The bar drains toward the left as the cache cools.
  c.rect(inner.x, barY, Math.round((inner.w * r.step) / BAR_STEPS), 2, ink)
  return c.svg()
}

export type PanelMotion = 'open' | 'opening' | 'closing'

const MOTION_MS = 250
const EASE_OUT = '0 0 .2 1'
const EASE_IN = '.4 0 1 1'

// The overlay: the strip's size, transparent but for the panel. Opening, the
// panel grows from his middle, scaling up and fading in as it moves out;
// closing, it shrinks back into him the same way, eased in.
export function drawPanel(opts: { px: number; to: number; readout: Readout; motion: PanelMotion; reducedMotion?: boolean }): {
  source: string
  width: number
  height: number
  place: PanelPlace
} | null {
  const place = placePanel(opts.px, opts.to)
  if (!place) return null
  const width = stripWidth(opts.px)
  const height = STRIP_HEIGHT
  if (opts.motion === 'closing' && opts.reducedMotion) return null
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width / SCALE} ${height / SCALE}" shape-rendering="crispEdges">`
  const body = panelBody(opts.readout, place.x, place.w)
  if (opts.motion === 'open' || opts.reducedMotion) return { source: `${head}${body}</svg>`, width, height, place }
  const cx = stripX(width, opts.to) / SCALE + BODY_MIDDLE.x
  const cy = BODY_MIDDLE.y
  const isOpening = opts.motion === 'opening'
  const ease = isOpening ? EASE_OUT : EASE_IN
  const timing = `dur="${MOTION_MS}ms" calcMode="spline" keyTimes="0;1" keySplines="${ease}" fill="freeze"`
  const [a, b] = isOpening ? [0, 1] : [1, 0]
  const at = (s: number) => (s === 0 ? `${cx} ${cy}` : '0 0')
  const source =
    `${head}<g opacity="${b}"><animate attributeName="opacity" values="${a};${b}" ${timing}/>` +
    `<g transform="translate(${at(b)})"><animateTransform attributeName="transform" type="translate" values="${at(a)};${at(b)}" ${timing}/>` +
    `<g transform="scale(${b})"><animateTransform attributeName="transform" type="scale" values="${a};${b}" ${timing}/>` +
    `${body}</g></g></g></svg>`
  return { source, width, height, place }
}
