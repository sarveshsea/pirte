// petri — a real 3d scene for the dish + volumetric projection of sim cells.
//
// pipeline per frame:
//
//   1. azimuth rotation around world Y axis:       (wx, wz) → (px, pz)
//   2. elevation tilt (camera pitch):               (py, pz) → (screenY, depth)
//   3. orthographic drop + char-aspect correction → (col, row)
//   4. z-buffer: larger depth wins (closer to camera)
//
// elevation convention: E = 0 is top-down, E = π/2 is side view. The visible
// dish is a circle of world-radius R at y = 0; R shrinks as elevation drops
// toward top-down so the projected ellipse never overflows the tile. sim
// cells are placed on the dish floor at y = 0 with a *height* pulled from
// the density ramp — dense glyphs pop up out of the dish, sparse glyphs
// stay on the floor. that's the 3d depth.
//
// intentionally no full-height solid pillars between floor and top glyph: we
// render a faint footprint on the floor plus a sparse lift connector so the
// dish still reads as 3d without collapsing into a text wall.

import { RAMP } from './index'

export type SceneView = {
  azimuth: number       // radians, rotation around Y axis
  elevation: number     // radians, 0 = top-down, π/2 = side view
  charAspect: number    // char width / char height (≈ 0.55)
}

export type ProjectedPoint = { col: number; row: number; depth: number }
export type VolumePass = {
  footprint: string
  lift: string
  cap: string
}

export const MAX_HEIGHT = 14.0              // world-height for density == 1 — enough lift for depth without turning into a wall
const MIN_HEIGHT_BOOST = 0.04               // sparse cells still float a touch above the floor
const DISH_MARGIN = 0.98                    // keep 2% padding inside the tile
const RAMP_LAST = RAMP.length - 1
const FALLBACK_HEIGHT = 0.34                // non-ramp glyphs (@, ◉, etc.) should read as markers, not towers
const HEIGHT_CURVE = 1.35                   // compress mid-tones so only dense regions lift strongly
const EMPTY_CHARS = new Set([' ', '\t', ''])
const FOOTPRINT_GLYPH = '·'
const LIFT_GLYPH = ':'
const LIFT_STEP = 2
// world-anchored azimuths for rim tick marks and floor spokes — these rotate
// with azimuth because they live in world space, unlike the circle silhouette
// which is azimuth-invariant. they're what makes rotation actually READ.
const RIM_ANCHOR_COUNT = 8
const FLOOR_SPOKE_COUNT = 12

// O(1) glyph → height [0, 1]. falls back to FALLBACK_HEIGHT for glyphs not in
// the density ramp (so non-ramp species still get a meaningful z extent).
// MIN_HEIGHT_BOOST keeps non-empty cells slightly lifted so sparse "dust"
// glyphs do not disappear into the floor field.
function heightForGlyph(ch: string): number {
  if (!ch || EMPTY_CHARS.has(ch)) return 0
  const idx = RAMP.indexOf(ch)
  const raw = idx < 0 ? FALLBACK_HEIGHT : Math.pow(idx / RAMP_LAST, HEIGHT_CURVE)
  return Math.max(MIN_HEIGHT_BOOST, raw)
}

export function projectPoint(
  wx: number, wy: number, wz: number,
  cols: number, rows: number,
  view: SceneView,
): ProjectedPoint {
  const cA = Math.cos(view.azimuth), sA = Math.sin(view.azimuth)
  const px = wx * cA + wz * sA
  const pz = -wx * sA + wz * cA
  const sE = Math.sin(view.elevation), cE = Math.cos(view.elevation)
  const screenY = wy * sE + pz * cE
  const depth   = wy * cE + pz * sE
  // character aspect: 1 unit in world-y spans `aspect` rows (rows are taller
  // than columns, so fewer rows per world unit than columns per world unit)
  const col = cols / 2 + px
  const row = rows / 2 - screenY * view.charAspect
  return { col, row, depth }
}

// dynamic dish radius — shrinks under steep top-down views so the projected
// ellipse always fits in the container with `DISH_MARGIN` padding.
export function computeDishRadius(cols: number, rows: number, view: SceneView): number {
  const maxRx = (cols / 2) * DISH_MARGIN
  const cE = Math.cos(view.elevation)
  const denom = Math.max(0.001, cE * view.charAspect)
  const maxRy = (rows / 2) * DISH_MARGIN / denom
  return Math.min(maxRx, maxRy)
}

// ellipse bounding box of the projected dish as % of container.
// azimuth is a rotation around Y so a circle at y=0 stays a circle in X
// horizontally; its screen-Y radius is R · cos(E) · aspect.
export function dishEllipseFrac(
  cols: number, rows: number,
  view: SceneView, R: number,
): { arFrac: number; brFrac: number } {
  const rxScreen = R
  const ryScreen = R * Math.cos(view.elevation) * view.charAspect
  return { arFrac: rxScreen / cols, brFrac: ryScreen / rows }
}

/* ---------------- volumetric layer rendering ---------------- */

// Buffers for one render pass. Keeping them sticky across calls would save
// allocation but reset logic gets subtle under resize; preallocate here once
// per call and trust the GC. 120×40 is only ~5k entries.
function zbufArray(n: number): Float32Array {
  const a = new Float32Array(n)
  a.fill(-Infinity)
  return a
}

function paintGlyph(
  glyphs: Uint16Array,
  zbuf: Float32Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  depth: number,
  glyph: string,
) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return
  const idx = row * cols + col
  if (depth <= zbuf[idx]) return
  zbuf[idx] = depth
  glyphs[idx] = glyph.codePointAt(0) || 32
}

function stringifyGlyphs(glyphs: Uint16Array, cols: number, rows: number): string {
  const out: string[] = new Array(rows)
  for (let r = 0; r < rows; r++) {
    let s = ''
    for (let c = 0; c < cols; c++) s += String.fromCodePoint(glyphs[r * cols + c])
    out[r] = s
  }
  return out.join('\n')
}

// Render a single sim layer's text through the 3d projection.
//
// The sim grid is mapped onto the dish disk so every cell sits inside the
// circle (2R×2R world, with non-uniform cell spacing when cols ≠ rows).
// Each non-empty cell produces three cues:
//   1. a faint footprint on the floor,
//   2. a sparse lift connector from floor to top,
//   3. the bright elevated cap.
// That restores the sense of height without painting a full solid text pillar.
export function renderVolumetricLayer(
  layerText: string,
  cols: number, rows: number,
  view: SceneView,
  R: number,
): VolumePass {
  const lines = layerText.split('\n')
  const N = cols * rows
  const capZ = zbufArray(N)
  const liftZ = zbufArray(N)
  const footprintZ = zbufArray(N)
  const capGlyphs = new Uint16Array(N)
  const liftGlyphs = new Uint16Array(N)
  const footprintGlyphs = new Uint16Array(N)
  capGlyphs.fill(32)
  liftGlyphs.fill(32)
  footprintGlyphs.fill(32)

  // scale sim-grid coords to fill the dish: cells are non-square in world,
  // but the projection collapses z by cos(E) so they appear ~square on screen.
  const sx = (2 * R) / cols
  const sz = (2 * R) / rows
  const ci = (cols - 1) / 2
  const cz = (rows - 1) / 2
  const R2 = R * R

  for (let j = 0; j < rows; j++) {
    const src = lines[j] || ''
    // flip z so row 0 of the sim maps to the far side (top of screen)
    const wz = (cz - j) * sz
    const wz2 = wz * wz

    for (let i = 0; i < cols; i++) {
      const ch = src[i]
      if (!ch || EMPTY_CHARS.has(ch)) continue

      const wx = (i - ci) * sx
      if (wx * wx + wz2 > R2) continue       // outside dish circle

      const h = heightForGlyph(ch) * MAX_HEIGHT
      const pBase = projectPoint(wx, 0, wz, cols, rows, view)
      const pTop  = projectPoint(wx, h, wz, cols, rows, view)
      const baseCol = Math.round(pBase.col)
      const baseRow = Math.round(pBase.row)
      const topCol = Math.round(pTop.col)
      const topRow = Math.round(pTop.row)

      paintGlyph(
        footprintGlyphs,
        footprintZ,
        cols,
        rows,
        baseCol,
        baseRow,
        pBase.depth,
        FOOTPRINT_GLYPH,
      )

      const rMin = Math.min(baseRow, topRow)
      const rMax = Math.max(baseRow, topRow)
      const span = rMax - rMin

      if (span >= 2) {
        for (let row = rMin + 1; row < rMax; row += LIFT_STEP) {
          const t = (row - rMin) / span
          const col = Math.round(pBase.col + (pTop.col - pBase.col) * t)
          const depth = pBase.depth + (pTop.depth - pBase.depth) * t
          paintGlyph(
            liftGlyphs,
            liftZ,
            cols,
            rows,
            col,
            row,
            depth,
            LIFT_GLYPH,
          )
        }
      }

      paintGlyph(capGlyphs, capZ, cols, rows, topCol, topRow, pTop.depth, ch)
    }
  }

  return {
    footprint: stringifyGlyphs(footprintGlyphs, cols, rows),
    lift: stringifyGlyphs(liftGlyphs, cols, rows),
    cap: stringifyGlyphs(capGlyphs, cols, rows),
  }
}

/* ---------------- dish chrome ---------------- */

// 8-sector rim glyph ramp by projected-angle — used when classifying rim
// samples as top (far) vs side vs bot (near) via their screen row.
const RIM_H = '─'
const RIM_V = '│'

export type DishChrome = {
  rimTop: string
  rimSide: string
  rimBot: string
  rimAnchors: string     // bright markers at fixed world azimuths — MAKES ROTATION VISIBLE
  meniscusTop: string
  meniscusBot: string
  floorDots: string
  floorSpokes: string    // radial lines from center to rim at fixed world azimuths
  floorRings: string     // concentric agar rings (azimuth-invariant depth cues)
  arFrac: number
  brFrac: number
}

// Agar ring radii as fraction of dish radius — concentric rings give a
// "grid on the plate" feel and read as curvature under tilt.
const AGAR_RINGS = [0.35, 0.65] as const

export function renderDishChrome(
  cols: number, rows: number,
  view: SceneView, R: number,
): DishChrome {
  const N = cols * rows
  const rimTop = new Uint8Array(N)
  const rimSide = new Uint8Array(N)
  const rimBot = new Uint8Array(N)
  const rimAnchors = new Uint8Array(N)
  const menTop = new Uint8Array(N)
  const menBot = new Uint8Array(N)
  const floor = new Uint8Array(N)
  const spokes = new Uint8Array(N)
  const rings = new Uint8Array(N)

  // --- rim: sample around the circle at y = 0, classify by screen row vs
  //     container midline. bracket "top" vs "bot" by projected row; "side"
  //     is kept as a small band at the horizontal extremes (|screenY| small)
  //     so it actually shows up as walls, not as part of the rounded arc.
  const midRow = rows / 2
  const sideRowTol = Math.max(1, rows * 0.08)
  const rimSamples = Math.max(180, Math.floor(Math.PI * R * 6))
  for (let k = 0; k < rimSamples; k++) {
    const tau = (k / rimSamples) * Math.PI * 2
    const wx = R * Math.cos(tau)
    const wz = R * Math.sin(tau)
    const p = projectPoint(wx, 0, wz, cols, rows, view)
    const col = Math.round(p.col), row = Math.round(p.row)
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue
    const idx = row * cols + col
    const dRow = row - midRow
    if (Math.abs(dRow) < sideRowTol) {
      rimSide[idx] = 1
    } else if (dRow < 0) {
      rimTop[idx] = 1
    } else {
      rimBot[idx] = 1
    }
  }
  for (let i = 0; i < N; i++) {
    if (rimSide[i]) { rimTop[i] = 0; rimBot[i] = 0 }
  }

  // --- rim anchors: bright glyphs at fixed world-space angles. these DO
  //     rotate under azimuth (they're attached to world, not to the circle's
  //     silhouette) — and they're the #1 visual cue that rotation is happening.
  for (let k = 0; k < RIM_ANCHOR_COUNT; k++) {
    const tau = (k / RIM_ANCHOR_COUNT) * Math.PI * 2
    const wx = R * Math.cos(tau)
    const wz = R * Math.sin(tau)
    const p = projectPoint(wx, 0, wz, cols, rows, view)
    const col = Math.round(p.col), row = Math.round(p.row)
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue
    // anchors paint over rim (they are rim highlights)
    rimAnchors[row * cols + col] = 1
    // also clear the plain-rim masks so colors don't fight
    const idx = row * cols + col
    rimTop[idx] = rimSide[idx] = rimBot[idx] = 0
  }

  // --- meniscus: ring inside the rim, slightly recessed into the "liquid"
  const menR = 0.92 * R
  const menY = -0.18
  const menSamples = Math.max(140, Math.floor(Math.PI * menR * 5))
  for (let k = 0; k < menSamples; k++) {
    const tau = (k / menSamples) * Math.PI * 2
    const wx = menR * Math.cos(tau)
    const wz = menR * Math.sin(tau)
    const p = projectPoint(wx, menY, wz, cols, rows, view)
    const col = Math.round(p.col), row = Math.round(p.row)
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue
    const idx = row * cols + col
    if (row < midRow) menTop[idx] = 1
    else menBot[idx] = 1
  }

  // --- floor dots: dense grid at y=0 inside r ≤ R. walk world X-Z at unit
  //     stride so every screen col and every projected row is populated.
  const R2 = R * R
  const step = 1
  const minW = -Math.ceil(R), maxW = Math.ceil(R)
  for (let wz = minW; wz <= maxW; wz += step) {
    const wz2 = wz * wz
    for (let wx = minW; wx <= maxW; wx += step) {
      if (wx * wx + wz2 > R2) continue
      // dither so it reads like a gel field rather than a uniform wash
      if (((wx + wz) & 3) !== 0) continue
      const p = projectPoint(wx, 0, wz, cols, rows, view)
      const col = Math.round(p.col), row = Math.round(p.row)
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue
      floor[row * cols + col] = 1
    }
  }

  // --- floor spokes: radial lines from center to rim at fixed world angles.
  //     dashed so they don't dominate. these are the other strong rotation cue.
  const spokeSamples = 40
  for (let s = 0; s < FLOOR_SPOKE_COUNT; s++) {
    const tau = (s / FLOOR_SPOKE_COUNT) * Math.PI * 2
    const cx = Math.cos(tau), sx = Math.sin(tau)
    for (let k = 1; k <= spokeSamples; k++) {
      // skip every other sample for a dashed feel
      if ((k & 1) === 0) continue
      const r = (k / spokeSamples) * R
      const wx = r * cx
      const wz = r * sx
      const p = projectPoint(wx, 0, wz, cols, rows, view)
      const col = Math.round(p.col), row = Math.round(p.row)
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue
      spokes[row * cols + col] = 1
    }
  }

  // --- agar rings: concentric circles at fractions of R (rotation-invariant
  //     but reads as depth under tilt). sparse dithered so floor stays readable.
  for (const frac of AGAR_RINGS) {
    const r = frac * R
    const ringSamples = Math.max(80, Math.floor(Math.PI * r * 3))
    for (let k = 0; k < ringSamples; k++) {
      if ((k & 1) === 0) continue
      const tau = (k / ringSamples) * Math.PI * 2
      const wx = r * Math.cos(tau)
      const wz = r * Math.sin(tau)
      const p = projectPoint(wx, 0, wz, cols, rows, view)
      const col = Math.round(p.col), row = Math.round(p.row)
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue
      rings[row * cols + col] = 1
    }
  }

  const { arFrac, brFrac } = dishEllipseFrac(cols, rows, view, R)

  return {
    rimTop:      fillMask(rimTop,     cols, rows, RIM_H),
    rimSide:     fillMask(rimSide,    cols, rows, RIM_V),
    rimBot:      fillMask(rimBot,     cols, rows, RIM_H),
    rimAnchors:  fillMask(rimAnchors, cols, rows, '◆'),
    meniscusTop: fillMask(menTop,     cols, rows, '·'),
    meniscusBot: fillMask(menBot,     cols, rows, '·'),
    floorDots:   fillMask(floor,      cols, rows, '·'),
    floorSpokes: fillMask(spokes,     cols, rows, '·'),
    floorRings:  fillMask(rings,      cols, rows, '·'),
    arFrac, brFrac,
  }
}

function fillMask(mask: Uint8Array, cols: number, rows: number, glyph: string): string {
  const out: string[] = new Array(rows)
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) line += mask[y * cols + x] ? glyph : ' '
    out[y] = line
  }
  return out.join('\n')
}
