// Claudeagotchi's artwork. Every pose is drawn on a small pixel grid and
// turned into a crisp SVG whose frames are switched by SMIL, so the animation
// runs in the surface itself: the plugin only swaps the drawing when the mood
// changes. The creature follows the reference exactly at two grid pixels per
// reference block: a 16x12 body, 4x4 arms, 2x2 eyes and four 2x4 legs.

export const W = 52
export const H = 26
export const SCALE = 3
const GROUND = H - 1
// A dark gray stage behind him, so he stands out from whatever surrounds the band.
const BACKDROP = `<rect width="${W}" height="${H}" fill="#212121"/>`

const PALETTE = {
  body: '#C7785C',
  ink: '#000000',
  metal: '#4A4A52',
  steel: '#74747E',
  screen: '#22303A',
  code: '#8ED8C3',
  code2: '#E2D2B6',
  desk: '#7B6C62',
  paper: '#ECE6D9',
  line: '#A49D91',
  mark: '#8C8C96',
  spark: '#C98A16',
  lens: '#B9D6DE',
}
type Color = keyof typeof PALETTE
const COLORS = Object.keys(PALETTE) as Color[]

export type Mood =
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

export const MOODS: readonly Mood[] = [
  'idle',
  'thinking',
  'coding',
  'reading',
  'searching',
  'running',
  'success',
  'attention',
  'error',
  'resting',
  'waking',
  'unpacking',
]

class Grid {
  cells: (Color | undefined)[] = new Array(W * H)

  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i >= 0 && i < W && j >= 0 && j < H) this.cells[j * W + i] = c
      }
    }
  }

  // Rows of a tiny glyph: '#' paints, anything else is clear.
  glyph(x: number, y: number, rows: string[], c: Color) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') this.rect(x + i, y + j, 1, 1, c)
    })
  }

  // One path per color, each row's runs as unit-high rectangles.
  svg(): string {
    const runs = new Map<Color, string>()
    for (let y = 0; y < H; y++) {
      let x = 0
      while (x < W) {
        const c = this.cells[y * W + x]
        if (!c) {
          x++
          continue
        }
        let end = x + 1
        while (end < W && this.cells[y * W + end] === c) end++
        runs.set(c, (runs.get(c) ?? '') + `M${x} ${y}h${end - x}v1h${x - end}z`)
        x = end
      }
    }
    return COLORS.filter(c => runs.has(c))
      .map(c => `<path fill="${PALETTE[c]}" d="${runs.get(c)}"/>`)
      .join('')
  }
}

// ---------------------------------------------------------------- creature

type Eyes =
  | 'front'
  | 'left'
  | 'right'
  | 'up'
  | 'upRight'
  | 'down'
  | 'downRight'
  | 'blink'
  | 'closed'
  | 'wide'
  | 'puzzled'
  | 'happy'
type Arm = 'out' | 'down' | 'chin' | 'scratch' | 'raise' | 'wave' | 'hover' | 'tap' | 'hold' | 'cheer' | 'stub' | 'stubUp'
type Legs = 'stand' | 'tap' | 'tuck' | 'stepA' | 'stepB'

type Pose = {
  x?: number // body's left column
  lift?: number // rows the whole creature is off the ground (a hop)
  drop?: number // rows the body sinks, legs shortening (a crouch; 4 sits)
  breathe?: number // rows the top of the body rises while sitting
  eyes?: Eyes
  l?: Arm
  r?: Arm
  legs?: Legs
  lean?: number // columns the head leans
}

const BODY_X = 10

function creature(g: Grid, p: Pose = {}) {
  const x = p.x ?? BODY_X
  const lift = p.lift ?? 0
  const drop = p.drop ?? 0
  const lean = p.lean ?? 0
  const top = GROUND - 15 - lift + drop
  const bottom = GROUND - 4 - lift + drop // last body row

  // Legs first: they run from the body down to the ground (or dangle in a hop).
  const legRows = p.legs === 'tuck' ? 2 : GROUND - lift - bottom
  if (legRows > 0) {
    for (const [i, col] of [0, 4, 10, 14].entries()) {
      // A raised foot: the tapping front leg, or one pair of a walking stride.
      const isRaised =
        (p.legs === 'tap' && i === 3) || (p.legs === 'stepA' && (i === 0 || i === 2)) || (p.legs === 'stepB' && (i === 1 || i === 3))
      g.rect(x + col, bottom + 1, 2, legRows - (isRaised ? 1 : 0), 'body')
    }
  }

  const rise = p.breathe ?? 0
  g.rect(x + lean, top - rise, 16, 6 + rise, 'body')
  g.rect(x, top + 6, 16, bottom - top - 5, 'body')

  arm(g, x + Math.max(0, lean), top, -1, p.l ?? 'out')
  arm(g, x + Math.min(0, lean), top, 1, p.r ?? 'out')
  eyes(g, x + lean, top - rise, p.eyes ?? 'front')
}

// side -1 is the creature's left (screen left), 1 its right.
function arm(g: Grid, x: number, top: number, side: number, pose: Arm) {
  const at = (dx: number, dy: number, w: number, h: number) =>
    g.rect(side < 0 ? x - dx - w : x + 16 + dx, top + dy, w, h, 'body')
  switch (pose) {
    case 'out':
      return at(0, 4, 4, 4)
    case 'down':
      return at(0, 5, 4, 4)
    case 'chin':
      return at(0, 2, 4, 4)
    case 'scratch':
      return at(0, 1, 4, 4)
    case 'raise':
      at(0, 2, 4, 4)
      return at(2, -1, 2, 3)
    case 'wave':
      at(0, 2, 4, 4)
      at(3, 0, 2, 2)
      return at(4, -2, 2, 2)
    case 'cheer':
      at(0, 1, 4, 4)
      return at(2, -3, 2, 4)
    case 'hover':
      return at(0, 2, 5, 4)
    case 'tap':
      return at(0, 4, 5, 4)
    case 'hold':
      return at(0, 4, 5, 4)
    case 'stub':
      return at(0, 5, 2, 3)
    case 'stubUp':
      return at(0, 3, 2, 3)
  }
}

function eyes(g: Grid, x: number, top: number, pose: Eyes) {
  const pair = (lx: number, rx: number, y: number, w = 2, h = 2) => {
    g.rect(x + lx, top + y, w, h, 'ink')
    g.rect(x + rx, top + y, w, h, 'ink')
  }
  switch (pose) {
    case 'front':
      return pair(2, 12, 2)
    case 'left':
      return pair(1, 10, 2)
    case 'right':
      return pair(4, 13, 2)
    case 'up':
      return pair(2, 12, 1)
    case 'upRight':
      return pair(4, 13, 1)
    case 'down':
      return pair(2, 12, 3)
    case 'downRight':
      return pair(4, 13, 3)
    case 'blink':
    case 'closed':
      return pair(2, 12, 3, 2, 1)
    case 'happy':
      return pair(2, 12, 2, 2, 1)
    case 'wide':
      return pair(2, 12, 1, 2, 3)
    case 'puzzled':
      g.rect(x + 2, top + 2, 2, 2, 'ink')
      return g.rect(x + 12, top + 3, 2, 1, 'ink')
  }
}

// ---------------------------------------------------------------- props

const MON_X = 36
const DESK_Y = 20
const MON_Y = DESK_Y - 12

// The desk, keyboard and monitor; `height` folds the monitor for the entrance.
// The keyboard sits where a tapping hand lands; `keys` lights one key.
function computer(g: Grid, opts: { height?: number; screen?: 'off' | 'on'; keys?: number } = {}) {
  const height = opts.height ?? 10
  g.rect(29, DESK_Y, 22, 1, 'desk')
  g.rect(30, DESK_Y + 1, 1, GROUND - DESK_Y, 'desk')
  g.rect(49, DESK_Y + 1, 1, GROUND - DESK_Y, 'desk')
  g.rect(30, DESK_Y - 1, 8, 1, 'metal')
  for (let k = 0; k < 3; k++) g.rect(32 + k * 2, DESK_Y - 1, 1, 1, k === opts.keys ? 'code' : 'steel')
  g.rect(40, DESK_Y - 1, 6, 1, 'metal')
  if (height <= 0) return
  const y = DESK_Y - 2 - height
  g.rect(42, y + height - 1, 2, DESK_Y - 1 - (y + height - 1), 'metal')
  g.rect(MON_X, y, 14, height, 'metal')
  g.rect(MON_X + 13, y + 1, 1, height - 2, 'steel')
  if (height >= 4) g.rect(MON_X + 1, y + 1, 12, height - 2, 'screen')
  if (opts.screen === 'on' && height >= 10) g.rect(MON_X + 1, y + 1, 12, 1, 'code')
}

// The program on the screen. Lines are [indent, length, accent], typed in
// order; the view shows the three most recent, so typing every line once
// brings the screen back to where it started and the loop is seamless.
const PROGRAM: [number, number, number][] = [
  [0, 7, 3],
  [2, 9, 4],
  [2, 6, 0],
  [0, 3, 0],
  [0, 8, 2],
  [2, 5, 0],
]

function code(g: Grid, typed: number, cursorOn: boolean) {
  // `typed` counts pixels typed since the loop began on line 2.
  let line = 2
  let left = typed
  while (left > PROGRAM[line % PROGRAM.length]![1]) {
    left -= PROGRAM[line % PROGRAM.length]![1]
    line++
  }
  const rows = [line - 2, line - 1, line]
  rows.forEach((n, i) => {
    const [indent, len, accent] = PROGRAM[((n % PROGRAM.length) + PROGRAM.length) % PROGRAM.length]!
    const shown = n === line ? left : len
    const y = MON_Y + 2 + i * 2
    const x0 = MON_X + 2 + indent
    if (shown > 0) g.rect(x0, y, Math.min(shown, accent || shown), 1, accent ? 'code2' : 'code')
    if (accent && shown > accent) g.rect(x0 + accent + 1, y, shown - accent - 1, 1, 'code')
    if (n === line && cursorOn && x0 + shown + 1 <= MON_X + 12) g.rect(x0 + shown + 1, y, 1, 1, 'code2')
  })
}

// A page held in the right hand; `reading` darkens the line being read.
function paper(g: Grid, reading: number, flip = false) {
  const x = 30
  const y = 10
  if (flip) {
    g.rect(x + 1, y, 3, 11, 'line')
    g.rect(x + 2, y + 1, 1, 9, 'paper')
    return
  }
  g.rect(x, y, 9, 11, 'line')
  g.rect(x + 1, y + 1, 7, 9, 'paper')
  for (let i = 0; i < 4; i++) g.rect(x + 2, y + 2 + i * 2, i % 2 ? 4 : 5, 1, i === reading ? 'ink' : 'line')
}

// A magnifying glass whose handle starts at the hand tip (hx, hy).
function magnifier(g: Grid, hx: number, hy: number) {
  g.rect(hx + 1, hy, 1, 1, 'steel')
  g.rect(hx + 2, hy - 1, 1, 1, 'steel')
  const x = hx + 2
  const y = hy - 6
  g.rect(x + 1, y, 3, 1, 'steel')
  g.rect(x, y + 1, 1, 3, 'steel')
  g.rect(x + 4, y + 1, 1, 3, 'steel')
  g.rect(x + 1, y + 4, 3, 1, 'steel')
  g.rect(x + 1, y + 1, 3, 3, 'lens')
}

// A little build box on the floor with three lights that step along.
function indicator(g: Grid, step: number) {
  g.rect(36, 17, 11, 9, 'metal')
  g.rect(37, 18, 9, 4, 'screen')
  for (let i = 0; i < 3; i++) g.rect(38 + i * 3, 19, 2, 2, i === step % 3 ? 'code' : 'metal')
  g.rect(38, 23, 7, 1, 'steel')
}

const marks = {
  bang: ['#', '#', '#', '', '#'],
  question: ['.##.', '#..#', '...#', '..#.', '', '..#.'],
  z: ['###', '..#', '.#', '###'],
  bigZ: ['####', '..#', '.#', '####'],
}

// ---------------------------------------------------------------- scenes

type Frame = { ms: number; draw: (g: Grid) => void }
type Scene = {
  intro?: Frame[]
  loop?: Frame[]
  still: (g: Grid) => void // the reduced-motion pose
  alt: string
}

const f = (ms: number, draw: (g: Grid) => void): Frame => ({ ms, draw })
const pose = (p: Pose, extra?: (g: Grid) => void) => (g: Grid) => {
  extra?.(g)
  creature(g, p)
}

const idleLoops: Frame[][] = [
  [
    f(2300, pose({})),
    f(120, pose({ eyes: 'blink' })),
    f(1700, pose({})),
    f(380, pose({ drop: 1 })),
    f(1500, pose({})),
    f(900, pose({ eyes: 'left' })),
    f(600, pose({})),
    f(110, pose({ eyes: 'blink' })),
    f(150, pose({})),
    f(110, pose({ eyes: 'blink' })),
    f(1100, pose({})),
  ],
  [
    f(1700, pose({})),
    f(700, pose({ lean: 1, eyes: 'right' })),
    f(1900, pose({})),
    f(120, pose({ eyes: 'blink' })),
    f(2600, pose({})),
    f(360, pose({ drop: 1, l: 'down', r: 'down' })),
    f(900, pose({})),
    f(120, pose({ eyes: 'blink' })),
    f(1800, pose({})),
  ],
]

function codingLoop(): Frame[] {
  const frames: Frame[] = []
  const total = PROGRAM.reduce((n, [, len]) => n + len, 0)
  const sitting = { drop: 2, eyes: 'right' as Eyes }
  let typed = 0
  let beat = 0
  // A rhythm per line: [ms per keystroke, pixels per keystroke]; the third
  // line is a burst, and each line ends with a look at the monitor.
  const rhythm: [number, number][] = [
    [150, 1],
    [160, 1],
    [85, 1],
    [150, 1],
    [170, 2],
    [90, 1],
  ]
  for (let line = 0; line < PROGRAM.length; line++) {
    const len = PROGRAM[(line + 2) % PROGRAM.length]![1]
    const [ms, step] = rhythm[line]!
    for (let done = 0; done < len; ) {
      done = Math.min(len, done + step)
      typed += step === 2 && done === len && len % 2 ? 1 : step
      const t = Math.min(typed, total)
      // The near hand and the far one (foreshortened, turned toward the desk)
      // take turns on the keys; the struck key lights up.
      const isNearUp = beat % 2 === 0
      const key = isNearUp ? undefined : (beat >> 1) % 3
      const bob = beat % 4 === 2 ? 1 : 0 // a nod on every other hover, never on a tap
      frames.push(
        f(
          ms,
          pose({ ...sitting, drop: 2 + bob, l: isNearUp ? 'stub' : 'stubUp', r: isNearUp ? 'hover' : 'tap' }, g => {
            computer(g, { keys: key })
            code(g, t, true)
          }),
        ),
      )
      beat++
    }
    const t = Math.min(typed, total)
    const lookMs = line === 2 ? 1000 : line === 5 ? 380 : 620
    frames.push(
      f(
        lookMs,
        pose({ ...sitting, eyes: 'upRight', l: 'stub', r: 'hover' }, g => {
          computer(g)
          code(g, t, false)
        }),
      ),
    )
    if (line === 2) {
      frames.push(
        f(
          120,
          pose({ ...sitting, eyes: 'blink', l: 'stub', r: 'hover' }, g => {
            computer(g)
            code(g, t, true)
          }),
        ),
      )
    }
  }
  return frames
}

const SCENES: Record<Mood, (variant: number) => Scene> = {
  idle: variant => ({
    loop: idleLoops[variant % idleLoops.length],
    still: pose({}),
    alt: 'Claudeagotchi is standing by',
  }),

  thinking: () => ({
    intro: [f(220, pose({ lean: -1, eyes: 'up' }))],
    loop: [
      f(700, pose({ lean: -1, eyes: 'upRight', r: 'chin' }, g => g.rect(30, 6, 1, 1, 'mark'))),
      f(700, pose({ lean: -1, eyes: 'upRight', r: 'chin' }, g => {
        g.rect(30, 6, 1, 1, 'mark')
        g.rect(32, 4, 1, 1, 'mark')
      })),
      f(900, pose({ lean: -1, eyes: 'upRight', r: 'chin' }, g => {
        g.rect(30, 6, 1, 1, 'mark')
        g.rect(32, 4, 1, 1, 'mark')
        g.rect(34, 2, 1, 1, 'mark')
      })),
      f(260, pose({ lean: -1, eyes: 'upRight', r: 'chin', legs: 'tap' })),
      f(240, pose({ lean: -1, eyes: 'upRight', r: 'chin' })),
      f(260, pose({ lean: -1, eyes: 'upRight', r: 'chin', legs: 'tap' })),
      f(700, pose({ lean: -1, eyes: 'up', r: 'chin' })),
      f(120, pose({ lean: -1, eyes: 'blink', r: 'chin' })),
      f(900, pose({ lean: -1, eyes: 'up', r: 'chin' })),
    ],
    still: pose({ lean: -1, eyes: 'upRight', r: 'chin' }),
    alt: 'Claudeagotchi is thinking',
  }),

  coding: () => ({
    intro: [
      f(90, pose({ eyes: 'right' }, g => computer(g, { height: 0 }))),
      f(90, pose({ drop: 1, eyes: 'right' }, g => computer(g, { height: 4 }))),
      f(110, pose({ drop: 2, eyes: 'right', l: 'stub', r: 'hover' }, g => computer(g, { height: 10 }))),
      f(140, pose({ drop: 2, eyes: 'upRight', l: 'stub', r: 'hover' }, g => computer(g, { screen: 'on' }))),
    ],
    loop: codingLoop(),
    still: pose({ drop: 2, eyes: 'right', l: 'stubUp', r: 'tap' }, g => {
      computer(g)
      code(g, 4, true)
    }),
    alt: 'Claudeagotchi is typing at a tiny computer',
  }),

  // Leaving the computer: plays once, then the next mood takes over.
  unpacking: () => ({
    intro: [
      f(110, pose({ drop: 2, eyes: 'right', l: 'stub', r: 'hover' }, g => computer(g))),
      f(90, pose({ drop: 1, eyes: 'right' }, g => computer(g, { height: 4 }))),
      f(90, pose({ eyes: 'right' }, g => computer(g, { height: 0 }))),
      f(1, pose({})),
    ],
    still: pose({}),
    alt: 'Claudeagotchi is putting the computer away',
  }),

  reading: () => {
    const look = (line: number, eyes: Eyes) =>
      pose({ eyes, r: 'hold', l: 'down' }, g => paper(g, line))
    return {
      loop: [
        f(800, look(0, 'downRight')),
        f(800, look(1, 'downRight')),
        f(120, pose({ eyes: 'blink', r: 'hold', l: 'down' }, g => paper(g, 1))),
        f(700, look(2, 'downRight')),
        f(800, look(3, 'downRight')),
        f(600, look(-1, 'right')),
        f(130, pose({ eyes: 'right', r: 'hold', l: 'chin' }, g => paper(g, -1, true))),
        f(130, pose({ eyes: 'right', r: 'hold', l: 'down' }, g => paper(g, -1))),
      ],
      still: look(1, 'downRight'),
      alt: 'Claudeagotchi is reading a file',
    }
  },

  searching: () => {
    // Where each arm pose puts the hand tip that holds the glass.
    const tips: Partial<Record<Arm, [number, number]>> = {
      out: [29, 14],
      down: [29, 15],
      hold: [30, 14],
      hover: [30, 13],
      chin: [29, 12],
    }
    const at = (r: Arm, eyes: Eyes) =>
      pose({ eyes, r, l: 'down' }, g => magnifier(g, ...tips[r]!))
    return {
      loop: [
        f(600, at('hold', 'right')),
        f(500, at('down', 'downRight')),
        f(500, at('hover', 'right')),
        f(120, at('hover', 'blink')),
        f(600, at('chin', 'upRight')),
        f(500, at('out', 'right')),
        f(700, at('hold', 'downRight')),
      ],
      still: at('hold', 'right'),
      alt: 'Claudeagotchi is searching the project',
    }
  },

  running: () => {
    const watch = (step: number, extra: Pose = {}) =>
      pose({ eyes: 'right', ...extra }, g => indicator(g, step))
    return {
      loop: [
        f(380, watch(0)),
        f(380, watch(1)),
        f(380, watch(2)),
        f(380, watch(0)),
        f(190, watch(1, { legs: 'tap' })),
        f(190, watch(1)),
        f(190, watch(2, { legs: 'tap' })),
        f(190, watch(2)),
        f(380, watch(0)),
        f(120, watch(1, { eyes: 'blink' })),
        f(260, watch(1)),
        f(380, watch(2)),
      ],
      still: watch(1),
      alt: 'Claudeagotchi is waiting for a command to finish',
    }
  },

  success: () => {
    const sparkle = (g: Grid) => {
      g.rect(6, 4, 1, 1, 'spark')
      g.rect(31, 2, 1, 1, 'spark')
      g.rect(34, 7, 1, 1, 'spark')
      g.rect(3, 9, 1, 1, 'spark')
    }
    return {
      intro: [
        f(130, pose({ drop: 2, l: 'down', r: 'down' })),
        f(110, pose({ lift: 3, l: 'cheer', r: 'cheer', eyes: 'happy', legs: 'tuck' })),
        f(260, pose({ lift: 5, l: 'cheer', r: 'cheer', eyes: 'happy', legs: 'tuck' }, sparkle)),
        f(120, pose({ lift: 2, l: 'raise', r: 'raise', eyes: 'happy' }, g => g.rect(31, 2, 1, 1, 'spark'))),
        f(130, pose({ drop: 2, l: 'out', r: 'out', eyes: 'happy' })),
        f(110, pose({ drop: 1, eyes: 'happy' })),
        f(1, pose({ eyes: 'happy' })),
      ],
      still: pose({ l: 'cheer', r: 'cheer', eyes: 'happy' }),
      alt: 'Claudeagotchi is celebrating a success',
    }
  },

  attention: () => {
    const bang = (g: Grid) => g.glyph(32, 2, marks.bang, 'spark')
    return {
      intro: [
        f(110, pose({ eyes: 'right' })),
        f(500, pose({ eyes: 'up', r: 'raise' }, bang)),
      ],
      loop: [
        f(1300, pose({ eyes: 'up', r: 'raise' })),
        f(200, pose({ eyes: 'up', r: 'wave' }, bang)),
        f(200, pose({ eyes: 'up', r: 'raise' }, bang)),
        f(200, pose({ eyes: 'up', r: 'wave' }, bang)),
        f(900, pose({ eyes: 'up', r: 'raise' })),
        f(120, pose({ eyes: 'blink', r: 'raise' })),
        f(1100, pose({ eyes: 'up', r: 'raise' })),
      ],
      still: pose({ eyes: 'up', r: 'raise' }, bang),
      alt: 'Claudeagotchi needs your attention',
    }
  },

  error: () => {
    const q = (g: Grid) => g.glyph(31, 3, marks.question, 'mark')
    const worried: Pose = { drop: 1, eyes: 'puzzled', r: 'chin' }
    return {
      intro: [
        f(70, pose({ x: BODY_X + 1, eyes: 'wide', l: 'chin', r: 'chin' })),
        f(70, pose({ x: BODY_X - 1, eyes: 'wide', l: 'chin', r: 'chin' })),
        f(70, pose({ x: BODY_X + 1, eyes: 'wide', l: 'chin', r: 'chin' })),
        f(70, pose({ x: BODY_X - 1, eyes: 'wide', l: 'chin', r: 'chin' })),
        f(260, pose({ eyes: 'wide' })),
      ],
      loop: [
        f(1500, pose(worried, q)),
        f(150, pose({ ...worried, r: 'scratch' }, q)),
        f(150, pose(worried, q)),
        f(150, pose({ ...worried, r: 'scratch' }, q)),
        f(1600, pose(worried)),
        f(120, pose({ ...worried, eyes: 'blink' })),
        f(900, pose(worried)),
      ],
      still: pose(worried, q),
      alt: 'Claudeagotchi saw something go wrong',
    }
  },

  resting: () => {
    const sit: Pose = { drop: 4, eyes: 'closed', l: 'down', r: 'down' }
    return {
      intro: [
        f(260, pose({ drop: 2, eyes: 'blink' })),
        f(300, pose({ drop: 3, eyes: 'closed', l: 'down', r: 'down' })),
      ],
      loop: [
        f(2200, pose(sit)),
        f(1500, pose({ ...sit, breathe: 1 })),
        f(1900, pose(sit)),
        f(1500, pose({ ...sit, breathe: 1 }, g => g.glyph(28, 9, marks.z, 'mark'))),
        f(900, pose(sit, g => g.glyph(30, 6, marks.z, 'mark'))),
        f(900, pose(sit, g => g.glyph(32, 2, marks.bigZ, 'mark'))),
        f(1400, pose({ ...sit, breathe: 1 })),
        f(1700, pose(sit)),
      ],
      still: pose(sit),
      alt: 'Claudeagotchi is resting',
    }
  },

  waking: () => ({
    intro: [
      f(160, pose({ drop: 4, eyes: 'blink', l: 'down', r: 'down' })),
      f(160, pose({ drop: 4, l: 'down', r: 'down' })),
      f(110, pose({ drop: 2 })),
      f(220, pose({ l: 'cheer', r: 'cheer', eyes: 'happy' })),
      f(1, pose({})),
    ],
    still: pose({}),
    alt: 'Claudeagotchi is waking up',
  }),
}

// How long a one-shot mood plays before it holds its last frame.
export function playMs(mood: Mood): number {
  const scene = SCENES[mood](0)
  if (scene.loop) return Infinity
  return (scene.intro ?? []).reduce((n, fr) => n + fr.ms, 0)
}

// ---------------------------------------------------------------- SVG

function frameSvg(draw: (g: Grid) => void): string {
  const g = new Grid()
  draw(g)
  return g.svg()
}

// `visible` windows of one distinct frame inside a loop of `period` ms, as a
// discrete SMIL animation of its visibility.
function loopAnimation(windows: [number, number][], period: number, begin: number): string {
  const steps: [number, string][] = []
  const push = (t: number, v: string) => {
    const last = steps[steps.length - 1]
    if (last && last[0] === t) last[1] = v
    else if (!last || last[1] !== v) steps.push([t, v])
  }
  if (windows[0]![0] > 0) push(0, 'hidden')
  for (const [s, e] of windows) {
    push(s, 'visible')
    if (e < period) push(e, 'hidden')
  }
  const values = steps.map(([, v]) => v).join(';')
  const keyTimes = steps.map(([t]) => +(t / period).toFixed(5)).join(';')
  return `<animate attributeName="visibility" calcMode="discrete" values="${values}" keyTimes="${keyTimes}" dur="${period}ms" begin="${begin}ms" repeatCount="indefinite"/>`
}

export type PetDrawing = { source: string; alt: string; width: number; height: number; isAnimated: boolean }

// Where he stands on the strip: `from` and `to` are fractions of the way
// across (0 the left end, 1 the right), and `px` the strip's width in CSS px.
export type Strip = { px: number; from: number; to: number }

const WALK_PX_PER_S = 110
const TRACK_GAP = 2 * SCALE
const TRACK = '#2E2E2E'
const TRACK_LIT = '#8A5644'
const STEP_MS = 120

// The walking cycle, facing the way he goes: one pair of feet up, pass, the
// other pair up, pass, with a small dip on each pass.
function walkFrames(isLeftward: boolean): Frame[] {
  const eyes: Eyes = isLeftward ? 'left' : 'right'
  return [
    f(STEP_MS, pose({ eyes, legs: 'stepA' })),
    f(STEP_MS, pose({ eyes, drop: 1 })),
    f(STEP_MS, pose({ eyes, legs: 'stepB' })),
    f(STEP_MS, pose({ eyes, drop: 1 })),
  ]
}

export function walkMs(strip: Strip): number {
  const travel = Math.max(0, strip.px - W * SCALE)
  const distance = Math.abs(strip.to - strip.from) * travel
  if (distance < SCALE) return 0
  return Math.max(4 * STEP_MS, Math.round(((distance / WALK_PX_PER_S) * 1000) / (4 * STEP_MS)) * 4 * STEP_MS)
}

// The frames of a scene as SVG groups whose animations start `delay` ms in.
function sceneGroups(scene: Scene, delay: number): string {
  // Each distinct frame is drawn once and shown in its windows of time.
  const bodies = new Map<string, { intro: string[]; windows: [number, number][] }>()
  const entry = (svg: string) => {
    let e = bodies.get(svg)
    if (!e) bodies.set(svg, (e = { intro: [], windows: [] }))
    return e
  }
  const intro = scene.intro ?? []
  const loop = scene.loop ?? []
  let t = delay
  intro.forEach((fr, i) => {
    const isFinal = i === intro.length - 1 && loop.length === 0
    entry(frameSvg(fr.draw)).intro.push(
      isFinal
        ? `<set attributeName="visibility" to="visible" begin="${t}ms" fill="freeze"/>`
        : `<set attributeName="visibility" to="visible" begin="${t}ms" dur="${fr.ms}ms"/>`,
    )
    t += fr.ms
  })
  const begin = t

  // What every loop frame shares (the desk, most of the creature) is drawn
  // once underneath; each frame keeps only the pixels it changes.
  const grids = loop.map(fr => {
    const g = new Grid()
    fr.draw(g)
    return g
  })
  const base = new Grid()
  if (grids.length > 1) {
    for (let i = 0; i < W * H; i++) {
      const c = grids[0]!.cells[i]
      if (c && grids.every(g => g.cells[i] === c)) {
        base.cells[i] = c
        for (const g of grids) g.cells[i] = undefined
      }
    }
  }
  const period = loop.reduce((n, fr) => n + fr.ms, 0)
  let at = 0
  loop.forEach((fr, i) => {
    entry(grids[i]!.svg()).windows.push([at, at + fr.ms])
    at += fr.ms
  })

  const under = base.svg()
  const baseGroup = !under
    ? ''
    : begin > 0
      ? `<g visibility="hidden">${under}<set attributeName="visibility" to="visible" begin="${begin}ms" fill="freeze"/></g>`
      : `<g>${under}</g>`
  const groups = [...bodies].map(([svg, e]) => {
    const anims = [...e.intro]
    if (e.windows.length) anims.push(loopAnimation(e.windows, period, begin))
    return `<g visibility="hidden">${svg}${anims.join('')}</g>`
  })
  return baseGroup + groups.join('')
}

// The walking cycle, shown for the first `ms` of the drawing only.
function walkGroups(isLeftward: boolean, ms: number): string {
  const frames = walkFrames(isLeftward)
  const period = frames.reduce((n, fr) => n + fr.ms, 0)
  let at = 0
  return frames
    .map(fr => {
      const windows: [number, number][] = [[at, at + fr.ms]]
      at += fr.ms
      const anim = loopAnimation(windows, period, 0).replace('repeatCount="indefinite"', `repeatDur="${ms}ms"`)
      return `<g visibility="hidden">${frameSvg(fr.draw)}${anim}</g>`
    })
    .join('')
}

// The strip he walks along, shared with the panel drawn over it.
export const STRIP_HEIGHT = H * SCALE + TRACK_GAP + SCALE
// His body's middle within his own canvas, in art pixels: where the panel grows from.
export const BODY_MIDDLE = { x: BODY_X + 8, y: GROUND - 10 }
// The span of his body and arms within his canvas, in art pixels.
export const BODY_SPAN = { left: BODY_X - 4, right: BODY_X + 20 }

export function stripWidth(px: number): number {
  return Math.max(W * SCALE, Math.round(px))
}

// Where his canvas starts along a strip `width` px wide, in whole art pixels so he stays crisp.
export function stripX(width: number, fraction: number): number {
  const travel = width - W * SCALE
  return Math.round((Math.min(1, Math.max(0, fraction)) * travel) / SCALE) * SCALE
}

export function drawPet(mood: Mood, opts: { variant?: number; reducedMotion?: boolean; strip?: Strip } = {}): PetDrawing {
  const scene = SCENES[mood](opts.variant ?? 0)
  const petW = W * SCALE
  const petH = H * SCALE
  const strip = opts.strip ?? { px: petW, from: 0, to: 0 }
  const width = stripWidth(strip.px)
  const xAt = (fraction: number) => stripX(width, fraction)
  // Under him runs a thin track, lit up to where he stands: the progress bar.
  const height = STRIP_HEIGHT
  const trackY = petH + TRACK_GAP
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#212121"/><rect y="${trackY}" width="${width}" height="${SCALE}" fill="${TRACK}"/>`
  const lit = (x: number) => x + petW / 2
  const pet = (body: string) => `<svg width="${petW}" height="${petH}" viewBox="0 0 ${W} ${H}">${body}</svg>`
  const size = { alt: scene.alt, width, height }

  if (opts.reducedMotion) {
    const x = xAt(strip.to)
    const placed = `<g transform="translate(${x},0)">${pet(frameSvg(scene.still))}</g>`
    const done = `<rect y="${trackY}" width="${lit(x)}" height="${SCALE}" fill="${TRACK_LIT}"/>`
    return { ...size, source: `${head}${done}${placed}</svg>`, isAnimated: false }
  }

  const fromX = xAt(strip.from)
  const toX = xAt(strip.to)
  const ms = fromX === toX ? 0 : walkMs({ ...strip, px: width })
  let move = ''
  let fill = ''
  if (ms > 0) {
    // One value per art pixel along the way, held in turn: a stepped glide.
    const dir = toX > fromX ? SCALE : -SCALE
    const xs: number[] = []
    for (let x = fromX; dir > 0 ? x <= toX : x >= toX; x += dir) xs.push(x)
    const values = xs.map(x => `${x} 0`).join(';')
    move = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="${values}" dur="${ms}ms" fill="freeze"/>`
    fill = `<animate attributeName="width" calcMode="discrete" values="${xs.map(lit).join(';')}" dur="${ms}ms" fill="freeze"/>`
  }
  const body = (ms > 0 ? walkGroups(toX < fromX, ms) : '') + sceneGroups(scene, ms)
  const walker = `<g transform="translate(${toX},0)">${move}${pet(body)}</g>`
  const done = `<rect y="${trackY}" width="${lit(toX)}" height="${SCALE}" fill="${TRACK_LIT}">${fill}</rect>`
  return { ...size, source: `${head}${walker}${done}</svg>`, isAnimated: true }
}

// Every frame of a mood in order, for previews and tests.
export function framesOf(mood: Mood, variant = 0): { ms: number; svg: string; phase: 'intro' | 'loop' }[] {
  const scene = SCENES[mood](variant)
  const wrap = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * SCALE}" height="${H * SCALE}" shape-rendering="crispEdges">${BACKDROP}${body}</svg>`
  return [
    ...(scene.intro ?? []).map(fr => ({ ms: fr.ms, svg: wrap(frameSvg(fr.draw)), phase: 'intro' as const })),
    ...(scene.loop ?? []).map(fr => ({ ms: fr.ms, svg: wrap(frameSvg(fr.draw)), phase: 'loop' as const })),
  ]
}
