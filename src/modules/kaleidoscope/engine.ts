import { noise2 } from '../../lib/perlin'
import { PALETTES, PALETTE_NAMES, type Palette } from './palettes'
import { setSound, setDroneSymmetry, setDroneEnergy, tinkle } from './audio'

// ─────────────────────────────────────────────────────────────────────
// ascii kaleidoscope — always-on, trippy, mirrored n-fold.
//
// every frame:
//   1. for each char cell (x, y): compute polar (r, θ), fold θ into the
//      canonical wedge [0, π/n] via reflection — this is the mirror.
//   2. three simultaneous layers at (r, foldedθ):
//        a) perlin color field (ever-drifting base hue + density)
//        b) spiral streams (continuously rotating bright trails)
//        c) pulse rings (spawned on click, expanding outward)
//   3. emit as html span runs — each cell carries a `kind` that maps to
//      a palette color or a reserved white/black.
// ─────────────────────────────────────────────────────────────────────

const RAMP = ' ·:-+*#%@█'
const RAMP_LEN = RAMP.length

// special kind sentinels outside palette range
const HL_WHITE = 250
const HL_DIM   = 251

type Pulse = {
  r: number           // in chars from center
  speed: number       // chars/sec
  age: number         // seconds
  colorIdx: number    // palette index
}

type Stream = {
  theta0: number      // initial angle in wedge-local coords
  omega: number       // angular speed (rad/sec)
  radial: number      // outward speed (chars/sec)
  colorIdx: number    // palette index
  pitch: number       // spiral tightness
  width: number       // perpendicular thickness in chars
}

export type Kaleidoscope = {
  setSize(cols: number, rows: number): void
  setN(n: number): void
  setScale(s: number): void
  setSpeed(s: number): void
  setPaused(p: boolean): void
  setCursor(x: number, y: number): void
  setCursorActive(active: boolean): void
  click(xPx: number, yPx: number, cellW: number, cellH: number): void
  setPalette(idx: number): void
  cyclePalette(): number
  paletteIdx(): number
  paletteName(): string
  setSoundOn(on: boolean): void
  frame(now: number): string
}

type Config = { n: number; scale: number; speed: number }

export function createKaleidoscope(cfg: Config): Kaleidoscope {
  let cols = 80, rows = 40
  let n = cfg.n
  let scale = cfg.scale
  let speed = cfg.speed
  let paused = false
  let t = 0          // master time (sec)
  let lastT = 0
  let palIdx = 0
  let cursorX = 0, cursorY = 0  // normalized [-1, 1]
  let cursorActive = false

  // layer state
  const pulses: Pulse[] = []
  const streams: Stream[] = makeStreams(6)

  function makeStreams(count: number): Stream[] {
    const out: Stream[] = []
    for (let i = 0; i < count; i++) {
      const wedge = Math.PI / n
      out.push({
        theta0: (i / count) * wedge,
        omega: 0.35 + ((i % 3) - 1) * 0.18,    // some spin each way, gentle
        radial: 4 + (i % 4) * 1.2,              // outward drift
        colorIdx: i % 6,
        pitch: 0.6 + (i % 5) * 0.15,            // spiral tightness
        width: 0.025 + (i % 3) * 0.01,          // angular thickness
      })
    }
    return out
  }

  return {
    setSize(c, r) { cols = c; rows = r },
    setN(v) {
      if (v === n) return
      n = v
      // rebuild streams in the new wedge width
      const next = makeStreams(streams.length)
      for (let i = 0; i < streams.length; i++) streams[i] = next[i]
      setDroneSymmetry(n)
    },
    setScale(v) { scale = v },
    setSpeed(v) { speed = v },
    setPaused(p) { paused = p },
    setCursor(x, y) { cursorX = x; cursorY = y },
    setCursorActive(a) { cursorActive = a },
    click(xPx, yPx, cellW, cellH) {
      // convert pixel → char-space relative to center
      const cx = (cols * cellW) / 2
      const cy = (rows * cellH) / 2
      const dx = (xPx - cx) / cellW
      const dy = (yPx - cy) / cellH
      const r = Math.hypot(dx, dy * 2)  // cells are ~2x tall, normalize
      pulses.push({
        r: Math.max(1, r * 0.3),
        speed: 18 + Math.random() * 6,
        age: 0,
        colorIdx: Math.floor(Math.random() * 6),
      })
      if (pulses.length > 10) pulses.splice(0, pulses.length - 10)
      tinkle(14)
    },
    setPalette(idx) { palIdx = ((idx % PALETTES.length) + PALETTES.length) % PALETTES.length },
    cyclePalette() { palIdx = (palIdx + 1) % PALETTES.length; return palIdx },
    paletteIdx() { return palIdx },
    paletteName() { return PALETTE_NAMES[palIdx] },
    setSoundOn(on) { setSound(on); if (on) setDroneSymmetry(n) },
    frame(now) {
      const dt = lastT === 0 ? 0 : Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      if (!paused) t += dt * Math.max(0.2, speed)

      // advance pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.age += dt
        p.r += p.speed * dt
        if (p.r > Math.max(cols, rows) || p.age > 4) pulses.splice(i, 1)
      }
      // drive drone with stream count + pulses
      setDroneEnergy(1000 + pulses.length * 800)

      return render(
        cols, rows, n, scale, t,
        PALETTES[palIdx], streams, pulses,
        cursorActive ? cursorX : 0,
        cursorActive ? cursorY : 0,
      )
    },
  }

  // tinkle is called directly from click() for pulse-born feedback.
  void tinkle
}

// ─────────────────────────────────────────────────────────────────────
// render: produce an html <span>-run string for a cols × rows char grid.
// ─────────────────────────────────────────────────────────────────────

function render(
  cols: number, rows: number, n: number, scale: number, t: number,
  palette: Palette,
  streams: Stream[], pulses: Pulse[],
  curX: number, curY: number,
): string {
  const cx = (cols - 1) / 2
  const cy = (rows - 1) / 2
  const wedge = Math.PI / n
  // normalize scale to something useful for perlin sampling
  const s = 0.06 + (60 - scale) * 0.003
  // chars are ~2× taller than wide — correct radius in char-aspect
  const yAspect = 2.0

  // cursor warp amount (0 when inactive)
  const wx = curX * 0.35
  const wy = curY * 0.35

  const chars: string[] = new Array(rows)
  const kinds: number[][] = new Array(rows)

  // rotating time offset for hue — creates global spin
  const spin = t * 0.35

  for (let y = 0; y < rows; y++) {
    const dy = (y - cy) * yAspect
    const rowChars: string[] = new Array(cols)
    const rowKinds: number[] = new Array(cols)
    for (let x = 0; x < cols; x++) {
      const dx = x - cx
      const r = Math.hypot(dx, dy)
      let th = Math.atan2(dy, dx)
      if (th < 0) th += 2 * Math.PI
      // fold into canonical wedge via reflection modulo
      const two = wedge * 2
      let fa = th % two
      if (fa > wedge) fa = two - fa

      // convert folded polar back to local xy for sampling (wedge-local)
      const wxp = Math.cos(fa) * r
      const wyp = Math.sin(fa) * r

      // ── base: perlin color field, multi-octave, spinning
      const nA = noise2(wxp * s + wx + Math.cos(spin) * 0.8, wyp * s + wy + Math.sin(spin) * 0.8)
      const nB = noise2(wxp * s * 1.9 - wy * 0.5, wyp * s * 1.9 + t * 0.4 + 17.3) * 0.55
      const nC = noise2(wxp * s * 3.3 + t * 0.8, wyp * s * 3.3 - t * 0.6 + 7.1) * 0.28
      const field = nA + nB + nC  // roughly [-1.8, 1.8]
      // intensity [0, 1]
      const intensity = clamp01((field + 1.5) / 3)
      // hue selection via a different noise channel that shifts in time
      const hueN = noise2(wxp * s * 0.5 + t * 0.18, wyp * s * 0.5 - t * 0.12 + 3.7)
      let palK = Math.floor(((hueN + 1) * 0.5 + t * 0.02) * palette.length) % palette.length
      if (palK < 0) palK += palette.length

      // base glyph from intensity ramp
      let idx = Math.floor(intensity * RAMP_LEN)
      if (idx < 0) idx = 0
      if (idx >= RAMP_LEN) idx = RAMP_LEN - 1
      let ch = RAMP[idx]
      let kind: number = palK

      // ── streams: bright spiral arms. check each stream; if cell lies within
      // the arm's angular band at this radius, upgrade the cell.
      for (let sIdx = 0; sIdx < streams.length; sIdx++) {
        const st = streams[sIdx]
        // spiral equation: theta(r) = theta0 + omega * t + pitch * r
        // evaluate arm's theta at radius r, then compare to our folded angle
        let armTh = (st.theta0 + st.omega * t + st.pitch * r * 0.03) % two
        armTh = ((armTh % two) + two) % two
        let armFolded = armTh % two
        if (armFolded > wedge) armFolded = two - armFolded
        // angular distance in folded space
        let d = Math.abs(armFolded - fa)
        if (d > wedge) d = two - d
        // only render within valid radial range
        const rMax = Math.max(cols, rows) * 0.55
        const rMin = 2 + (sIdx % 3) * 2
        // shift each arm radially along t*radial (head of trail)
        const head = (t * st.radial + sIdx * 8) % rMax
        const trailLen = 12 + (sIdx % 3) * 6
        // trail runs inward from head; cell's radius relative to head
        const radialPos = head - r
        if (r < rMax && r > rMin && d < st.width * wedge && radialPos > -2 && radialPos < trailLen) {
          // trail brightness: 1 at head, fading along the tail
          const tb = Math.max(0, 1 - radialPos / trailLen)
          if (tb > 0.25) {
            // pick a brighter glyph
            if (tb > 0.85)       ch = '█'
            else if (tb > 0.6)   ch = '#'
            else if (tb > 0.4)   ch = '*'
            else                 ch = '+'
            kind = st.colorIdx
          }
        }
      }

      // ── pulses: expanding bright rings
      for (let pi = 0; pi < pulses.length; pi++) {
        const p = pulses[pi]
        const dr = Math.abs(r - p.r)
        const bandHalf = 1.8
        if (dr < bandHalf) {
          const a = Math.max(0, 1 - p.age / 3.5) * Math.max(0, 1 - dr / bandHalf)
          if (a > 0.35) {
            ch = a > 0.75 ? '●' : a > 0.5 ? '◉' : '○'
            kind = a > 0.75 ? HL_WHITE : p.colorIdx
          }
        }
      }

      rowChars[x] = ch
      rowKinds[x] = kind
    }
    chars[y] = rowChars.join('')
    kinds[y] = rowKinds
  }

  return toHTML(chars, kinds, palette)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// emit as coalesced span runs per line. one <span> per color change.
function toHTML(chars: string[], kinds: number[][], palette: Palette): string {
  const lines = new Array<string>(chars.length)
  for (let y = 0; y < chars.length; y++) {
    const row = chars[y]
    const k = kinds[y]
    let line = ''
    let runStart = 0
    let curK = k[0]
    for (let x = 1; x <= row.length; x++) {
      if (x === row.length || k[x] !== curK) {
        const segment = row.slice(runStart, x)
        line += `<span style="color:${colorFor(curK, palette)}">${escape(segment)}</span>`
        runStart = x
        curK = k[x]
      }
    }
    lines[y] = line
  }
  return lines.join('\n')
}

function colorFor(kind: number, palette: Palette): string {
  if (kind === HL_WHITE) return '#ffffff'
  if (kind === HL_DIM)   return '#3a3a3a'
  return palette[kind % palette.length]
}

function escape(s: string): string {
  if (s.indexOf('<') < 0 && s.indexOf('>') < 0 && s.indexOf('&') < 0) return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
