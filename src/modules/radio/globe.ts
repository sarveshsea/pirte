/* globe — real-earth binary cartography for world radio
   ─────────────────────────────────────────────────────
   renders a rotating unit sphere in ascii, sampling actual continents
   from the packed 720×360 landmass bitmap (see landmass.ts). each cell
   inverts screen → sphere, rotates by axial tilt then yaw, converts
   (X, Y, Z) → (lat, lon), samples land, and emits a binary glyph.

   on top of that:

     • solar sub-point from UTC → lambertian terminator sweeps in real time
     • station kde in world-space via a 5° lat/lon bucket grid
     • forward projection exported so the route can position marker dots
       each frame by rotating (lat, lon) → screen (col, row)
     • nearest-station via great-circle argmax for click hit-testing

   all trig inside the hot loop is unavoidable — but 120 × ~50 cells =
   ~6000 samples per frame runs well under one ms on modern hardware. */

import { sampleLand } from './landmass'
import type { Station } from './api'


// ─── projection ──────────────────────────────────────────────────────────

/* screen pixel (col, row) → world-space unit vector on the visible
   hemisphere, OR null if the pixel lies outside the inscribed sphere. */
export function sphereFromScreen(
  col: number, row: number,
  cols: number, rows: number,
  cellAspect: number, yaw: number, tilt: number,
): { X: number; Y: number; Z: number } | null {
  const { cx, cy, rxInv, ryInv } = frame(cols, rows, cellAspect)
  const nx = (col - cx) * rxInv
  const ny = (cy - row) * ryInv
  const r2 = nx * nx + ny * ny
  if (r2 > 1) return null
  const z = Math.sqrt(1 - r2)
  return unrotate(nx, ny, z, yaw, tilt)
}

/* world (lat, lon) → screen cell. `visible` is true only when the point
   is on the front hemisphere AND lands inside the inscribed sphere. the
   caller uses the returned col/row even when visible=false if it wants
   a smooth off-screen transition. */
export function latLonToScreen(
  lat: number, lon: number,
  cols: number, rows: number,
  cellAspect: number, yaw: number, tilt: number,
): { col: number; row: number; visible: boolean; z: number } {
  // world unit vector for (lat, lon)
  const latR = lat * Math.PI / 180
  const lonR = lon * Math.PI / 180
  const cosLat = Math.cos(latR)
  const X = cosLat * Math.sin(lonR)
  const Y = Math.sin(latR)
  const Z = cosLat * Math.cos(lonR)
  // world → camera — algebraic inverse of `unrotate`:
  //   nx = cosY·X - sinY·Z
  //   z1 = sinY·X + cosY·Z
  //   ny = cosT·Y + sinT·z1
  //   nz = -sinT·Y + cosT·z1
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt)
  const nx =  cosY * X - sinY * Z
  const z1 =  sinY * X + cosY * Z
  const ny =  cosT * Y + sinT * z1
  const nz = -sinT * Y + cosT * z1
  const { cx, cy, rxInv, ryInv } = frame(cols, rows, cellAspect)
  const col = cx + nx / rxInv
  const row = cy - ny / ryInv
  const visible = nz > 0 && (nx * nx + ny * ny) <= 1
  return { col, row, visible, z: nz }
}

function frame(cols: number, rows: number, cellAspect: number) {
  const diamRows = Math.min(rows, cols * cellAspect) * 0.94
  const diamCols = diamRows / cellAspect
  return {
    cx: (cols - 1) / 2,
    cy: (rows - 1) / 2,
    rxInv: 1 / (diamCols / 2),
    ryInv: 1 / (diamRows / 2),
  }
}

/* camera (nx, ny, z) → world (X, Y, Z) by undoing tilt (around X) then
   yaw (around Y). the algebraic inverse is used in latLonToScreen. */
function unrotate(nx: number, ny: number, z: number, yaw: number, tilt: number) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt)
  const y1 = cosT * ny - sinT * z
  const z1 = sinT * ny + cosT * z
  const X = cosY * nx + sinY * z1
  const Y = y1
  const Z = -sinY * nx + cosY * z1
  return { X, Y, Z }
}


// ─── solar sub-point ─────────────────────────────────────────────────────

/* where on earth is the sun directly overhead right now? used to build
   the world-space light vector for a real-time lambert terminator.

   declination approximation (Cooper 1969):
     δ = 23.44° · sin( 2π · (N − 80) / 365.25 )
   equation of time is ignored (up to ±16 min); close enough for a
   terminator at ~0.5° resolution.

   sub-longitude:  λ_sun = 180° − 15° · UTChours  (east positive) */
export function solarSubPoint(d: Date = new Date()): { lat: number; lon: number } {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const dayMs = 86400000
  const N = (d.getTime() - start) / dayMs  // fractional day of year
  const decl = 23.44 * Math.sin(2 * Math.PI * (N - 80) / 365.25)
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  const lon = 180 - 15 * hours
  // normalise to [-180, 180]
  const lonNorm = ((lon + 180) % 360 + 360) % 360 - 180
  return { lat: decl, lon: lonNorm }
}

export function subPointToLight(sub: { lat: number; lon: number }): { x: number; y: number; z: number } {
  const latR = sub.lat * Math.PI / 180
  const lonR = sub.lon * Math.PI / 180
  const c = Math.cos(latR)
  return { x: c * Math.sin(lonR), y: Math.sin(latR), z: c * Math.cos(lonR) }
}


// ─── station bucket grid ─────────────────────────────────────────────────

/* precomputed per-station unit vector + a 5° lat/lon bucket grid so the
   kde can bound its neighbour search. ~3k stations fit in ~2500 buckets;
   average bucket holds ~1 station, a few hotspots hold dozens. */
const BUCKET_STEP_DEG = 5
const BUCKET_COLS = 360 / BUCKET_STEP_DEG   // 72
const BUCKET_ROWS = 180 / BUCKET_STEP_DEG   // 36

export type StationPt = {
  station: Station
  X: number; Y: number; Z: number
}

export type StationGrid = {
  all: StationPt[]
  buckets: StationPt[][]  // length BUCKET_COLS * BUCKET_ROWS
}

export function buildStationGrid(stations: Station[]): StationGrid {
  const buckets: StationPt[][] = Array.from(
    { length: BUCKET_COLS * BUCKET_ROWS }, () => []
  )
  const all: StationPt[] = []
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue
    const latR = s.lat * Math.PI / 180
    const lonR = s.lon * Math.PI / 180
    const c = Math.cos(latR)
    const pt: StationPt = {
      station: s,
      X: c * Math.sin(lonR),
      Y: Math.sin(latR),
      Z: c * Math.cos(lonR),
    }
    all.push(pt)
    const bc = Math.max(0, Math.min(BUCKET_COLS - 1, Math.floor((s.lon + 180) / BUCKET_STEP_DEG)))
    const br = Math.max(0, Math.min(BUCKET_ROWS - 1, Math.floor((90 - s.lat) / BUCKET_STEP_DEG)))
    buckets[br * BUCKET_COLS + bc].push(pt)
  }
  return { all, buckets }
}

/* angular-distance kde: sum exp(-θ²/σ²) over stations within ~3σ of (X,Y,Z).
   σ in radians. works directly from the bucket grid for O(1+neighbours). */
function kdeAt(grid: StationGrid, X: number, Y: number, Z: number, sigma: number): number {
  const latR = Math.asin(Math.max(-1, Math.min(1, Y)))
  const lonR = Math.atan2(X, Z)
  const latDeg = latR * 180 / Math.PI
  const lonDeg = lonR * 180 / Math.PI
  // radius in degrees for 3σ — convert from radians
  const searchDeg = (sigma * 3) * 180 / Math.PI
  const dLatCells = Math.ceil(searchDeg / BUCKET_STEP_DEG)
  // in longitude, 1° covers less great-circle distance near poles — we
  // inflate dLonCells by 1/cos(lat) to compensate (clamped to a half-hemisphere)
  const cosLat = Math.max(0.15, Math.cos(latR))
  const dLonCells = Math.min(BUCKET_COLS, Math.ceil((searchDeg / BUCKET_STEP_DEG) / cosLat))
  const centreCol = Math.floor((lonDeg + 180) / BUCKET_STEP_DEG)
  const centreRow = Math.floor((90 - latDeg) / BUCKET_STEP_DEG)
  const twoSigmaSq = 2 * sigma * sigma
  let h = 0
  for (let dr = -dLatCells; dr <= dLatCells; dr++) {
    const r = centreRow + dr
    if (r < 0 || r >= BUCKET_ROWS) continue
    for (let dc = -dLonCells; dc <= dLonCells; dc++) {
      let c = (centreCol + dc) % BUCKET_COLS
      if (c < 0) c += BUCKET_COLS
      const bucket = grid.buckets[r * BUCKET_COLS + c]
      for (let i = 0; i < bucket.length; i++) {
        const p = bucket[i]
        const dot = p.X * X + p.Y * Y + p.Z * Z
        // great-circle angle ≈ acos(dot); skip acos via small-angle: use
        // 2·sin(θ/2) = √(2 - 2·dot), which squared gives 2 - 2·dot = θ² + O(θ⁴).
        const thetaSq = Math.max(0, 2 - 2 * dot)
        if (thetaSq > twoSigmaSq * 4.5) continue  // > 3σ cutoff
        h += Math.exp(-thetaSq / twoSigmaSq)
      }
    }
  }
  return h
}

/* nearest station to a world-space unit vector, by great-circle distance.
   linear scan over all points — ~3k stations, runs in < 0.1 ms. */
export function nearestStation(
  grid: StationGrid,
  X: number, Y: number, Z: number,
  maxAngleRad = 0.35,
): { station: Station; angle: number } | null {
  let best: StationPt | null = null
  let bestDot = Math.cos(maxAngleRad)  // higher dot = closer
  for (let i = 0; i < grid.all.length; i++) {
    const p = grid.all[i]
    const d = p.X * X + p.Y * Y + p.Z * Z
    if (d > bestDot) { bestDot = d; best = p }
  }
  return best ? { station: best.station, angle: Math.acos(Math.min(1, bestDot)) } : null
}

/* all stations within angleRad of the given world point. used for the
   hover tooltip ("3 stations near here"). order not guaranteed. */
export function stationsNear(
  grid: StationGrid,
  X: number, Y: number, Z: number,
  angleRad = 0.08,
): Station[] {
  const thr = Math.cos(angleRad)
  const out: Station[] = []
  for (let i = 0; i < grid.all.length; i++) {
    const p = grid.all[i]
    const d = p.X * X + p.Y * Y + p.Z * Z
    if (d >= thr) out.push(p.station)
  }
  return out
}


// ─── rendering ───────────────────────────────────────────────────────────

export type GlobeState = {
  yaw: number
  tilt: number
  omega: number        // rad / s
  rotating: boolean
  lighting: boolean
  graticule: boolean
  sunSync: boolean     // true: solar sub-point from UTC; false: fixed overhead light
  stippling: number    // 0..1 — density of binary stippling on land
  charMode: 'binary' | 'hex' | 'blocks'
}

export function createGlobeState(): GlobeState {
  return {
    yaw: 0,
    tilt: 0.38,
    omega: 0.12,
    rotating: true,
    lighting: true,
    graticule: false,
    sunSync: true,
    stippling: 0.75,
    charMode: 'binary',
  }
}

export type GlobeStats = {
  cols: number; rows: number
  surfCells: number
  landCells: number
  oceanCells: number
  litCells: number
  visibleStations: number
}

// world-space hash for stable per-point stippling — simple multiply-mix, cheap.
function whash(X: number, Y: number, Z: number): number {
  const h =
    Math.floor(X * 1597.3) ^
    Math.floor(Y * 3203.7) * 0x9e3775 ^
    Math.floor(Z * 4813.1) * 0x85ebca
  return ((h | 0) ^ ((h | 0) >>> 15)) & 0xffff
}

const CHARS_HEX = '0123456789ABCDEF'

// module-scoped scratch buffers for renderGlobe. allocated lazily and grown
// only when the cell count increases. drops ~5-6 typed-array allocations
// per frame (~120KB/frame at 10k cells → 7 MB/sec at 60fps).
let _sHeat:      Float32Array = new Float32Array(0)
let _sIsLand:    Uint8Array   = new Uint8Array(0)
let _sIsSurface: Uint8Array   = new Uint8Array(0)
let _sBaseChars: string[]     = []
let _sDotChars:  string[]     = []
let _sBaseLines: string[]     = []
let _sHotLines:  string[]     = []
let _sDotLines:  string[]     = []

function ensureScratch(nCells: number, rows: number) {
  if (_sHeat.length < nCells) {
    _sHeat      = new Float32Array(nCells)
    _sIsLand    = new Uint8Array(nCells)
    _sIsSurface = new Uint8Array(nCells)
    _sBaseChars = new Array<string>(nCells)
    _sDotChars  = new Array<string>(nCells)
  }
  if (_sBaseLines.length < rows) {
    _sBaseLines = new Array<string>(rows)
    _sHotLines  = new Array<string>(rows)
    _sDotLines  = new Array<string>(rows)
  }
}

export function renderGlobe(
  state: GlobeState,
  cols: number,
  rows: number,
  cellAspect: number,
  grid: StationGrid,
  now: Date,
): { base: string; hot: string; dots: string; stats: GlobeStats; lightFront: boolean } {
  const { cx, cy, rxInv, ryInv } = frame(cols, rows, cellAspect)
  const cosY = Math.cos(state.yaw), sinY = Math.sin(state.yaw)
  const cosT = Math.cos(state.tilt), sinT = Math.sin(state.tilt)

  // light direction: either solar sub-point (real-time) or a fixed camera-ish light
  let lx = 0.55, ly = 0.45, lz = 0.70
  if (state.sunSync) {
    const l = subPointToLight(solarSubPoint(now))
    lx = l.x; ly = l.y; lz = l.z
  } else {
    const lmag = Math.hypot(lx, ly, lz)
    lx /= lmag; ly /= lmag; lz /= lmag
  }

  // kde scale — σ in radians. tuned for ~5° gaussian footprint.
  const sigma = (6 * Math.PI) / 180

  // calibrate kde hot threshold by sampling a few hundred cells once per frame.
  // we reuse the base loop to collect heats; then compose a hot overlay in a
  // second pass. tracked in a typed array to avoid string churn.
  const nCells = cols * rows
  ensureScratch(nCells, rows)
  const heat = _sHeat
  const baseChars = _sBaseChars
  const isLand = _sIsLand
  const isSurface = _sIsSurface
  // reset the typed buffers — typed arrays support a direct in-place fill.
  // for baseChars we let the hot loop overwrite every index.
  heat.fill(0, 0, nCells)
  isLand.fill(0, 0, nCells)
  isSurface.fill(0, 0, nCells)

  let surfCells = 0, landCells = 0, oceanCells = 0, litCells = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      const nx = (col - cx) * rxInv
      const ny = (cy - row) * ryInv
      const r2 = nx * nx + ny * ny
      if (r2 > 1) { baseChars[idx] = ' '; continue }

      const z = Math.sqrt(1 - r2)
      const y1 = cosT * ny - sinT * z
      const z1 = sinT * ny + cosT * z
      const X = cosY * nx + sinY * z1
      const Y = y1
      const Z = -sinY * nx + cosY * z1

      isSurface[idx] = 1
      surfCells++

      // lambert term — night side fades out
      const ld = state.lighting ? (lx * X + ly * Y + lz * Z) : 1
      const lit = ld > -0.08
      if (lit) litCells++

      // lat/lon for landmass lookup + graticule
      const Yclamp = Math.max(-1, Math.min(1, Y))
      const latR = Math.asin(Yclamp)
      const lonR = Math.atan2(X, Z)
      const lat = latR * 180 / Math.PI
      const lon = lonR * 180 / Math.PI

      // graticule overlay — 30° steps, thickness-corrected at poles
      let grid30 = false
      if (state.graticule) {
        const step = Math.PI / 6
        const half = step / 2
        const dLat = Math.abs(((latR % step) + step + half) % step - half)
        const dLon = Math.abs(((lonR % step) + step + half) % step - half)
        const cosLat = Math.max(0.1, Math.cos(latR))
        if (dLat < 0.009 || dLon < 0.009 / cosLat) grid30 = true
      }

      const land = sampleLand(lat, lon)
      if (land) { landCells++; isLand[idx] = 1 } else oceanCells++

      // ocean rendering: faint dots on the day side only
      if (!land) {
        if (!lit) baseChars[idx] = ' '
        else if (grid30) baseChars[idx] = '·'
        else {
          const h = whash(X, Y, Z)
          baseChars[idx] = (h & 0xff) > 250 ? '·' : ' '
        }
        continue
      }

      // land rendering — binary stippling weighted by lambert + user dial
      if (grid30 && lit) { baseChars[idx] = '+'; continue }
      const hashVal = whash(X * 3, Y * 3, Z * 3) / 0xffff  // [0, 1)
      const lightWeight = state.lighting ? Math.max(0.12, ld * 0.7 + 0.4) : 1
      const inkProb = state.stippling * lightWeight

      if (hashVal > inkProb) {
        // dim cell
        if (state.lighting && ld < 0.02) baseChars[idx] = ' '
        else baseChars[idx] = hashVal > inkProb + 0.3 ? ' ' : '·'
        continue
      }

      // chose a glyph. for binary mode, 0 for low-hash, 1 for high-hash
      // — gives the land a balanced 0/1 texture rather than all 1s.
      if (state.charMode === 'binary') {
        baseChars[idx] = hashVal < inkProb * 0.5 ? '1' : '0'
      } else if (state.charMode === 'hex') {
        const k = Math.min(15, Math.max(0, Math.floor(hashVal * 16)))
        baseChars[idx] = CHARS_HEX[k]
      } else {
        const blocks = '░▒▓█'
        const k = Math.min(3, Math.max(0, Math.floor(lightWeight * 4)))
        baseChars[idx] = blocks[k]
      }

      // heat kde on lit land cells — used for the hot overlay
      if (lit) heat[idx] = kdeAt(grid, X, Y, Z, sigma)
    }
  }

  // find the hot threshold: 90th percentile of non-zero heats. sampling
  // avoids the full sort on ~6k values per frame. we iterate only nCells —
  // the scratch heap may be larger from a prior frame with bigger grid.
  let hotThreshold = Infinity
  {
    const samp: number[] = []
    for (let i = 0; i < nCells; i += 7) if (heat[i] > 0) samp.push(heat[i])
    if (samp.length > 0) {
      samp.sort((a, b) => a - b)
      hotThreshold = samp[Math.floor(samp.length * 0.80)]  // top 20% glow
    }
  }

  // station-dot overlay — a parallel grid with `•` at each visible station's
  // screen cell and spaces elsewhere. we also compute the visible-station
  // count here (one pass) so the telemetry tile has a real number.
  const dotChars = _sDotChars
  // reset only the used range; ' ' is interned so this allocates nothing.
  for (let i = 0; i < nCells; i++) dotChars[i] = ' '
  let visibleStations = 0
  for (let i = 0; i < grid.all.length; i++) {
    const p = grid.all[i]
    const x1 =  cosY * p.X - sinY * p.Z
    const z1 =  sinY * p.X + cosY * p.Z
    const ny =  cosT * p.Y + sinT * z1
    const nz = -sinT * p.Y + cosT * z1
    const nx = x1
    if (nz <= 0) continue
    if (nx * nx + ny * ny > 1) continue
    visibleStations++
    const scol = Math.round(cx + nx / rxInv)
    const srow = Math.round(cy - ny / ryInv)
    if (scol < 0 || srow < 0 || scol >= cols || srow >= rows) continue
    const di = srow * cols + scol
    dotChars[di] = '•'
  }

  // compose — base string + parallel hot overlay + dot overlay
  const baseLines = _sBaseLines
  const hotLines  = _sHotLines
  const dotLines  = _sDotLines
  for (let row = 0; row < rows; row++) {
    let b = '', h = '', d = ''
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      b += baseChars[idx]
      if (isLand[idx] && heat[idx] >= hotThreshold && isFinite(hotThreshold)) {
        h += baseChars[idx]
      } else {
        h += ' '
      }
      d += dotChars[idx]
    }
    baseLines[row] = b
    hotLines[row] = h
    dotLines[row] = d
  }

  // clamp scratch arrays to the current row count — otherwise a shrink (e.g.
  // window resize to a smaller viewport) would include stale rows in the join.
  baseLines.length = rows
  hotLines.length  = rows
  dotLines.length  = rows

  return {
    base: baseLines.join('\n'),
    hot:  hotLines.join('\n'),
    dots: dotLines.join('\n'),
    stats: { cols, rows, surfCells, landCells, oceanCells, litCells, visibleStations },
    lightFront: lz > 0.15,
  }
}
