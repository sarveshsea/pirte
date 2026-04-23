import { mulberry32 } from '../../lib/rng'
import { rybToRgb, mixRyb, PALETTES, type RGB } from './ryb'
import { fbm, warp, gaussian, expDraw } from './noise'

// ---------------------------------------------------------------
// pigment/generate — ribbons of luminous color flowing across a
// dark substrate. reads like a river of pigment seen from above,
// or long-exposure bioluminescence.
//
// pipeline per particle:
//   1. choose ribbon i, curve-parameter t ∈ [0, 1]
//   2. evaluate harmonic curve Cᵢ(t) = (cx + Σ aₖ sin(2πfₖt + φₖ), H·t)
//   3. compute tangent Tᵢ(t) and normal Nᵢ(t) = (−Ty, Tx)/‖T‖
//   4. draw offset u from mixture: P_core·|N(0,1)|·ρ + (1−P_core)·Exp(1)·σ
//      (gaussian core + exponential spread tail, both perpendicular to T)
//   5. add scatter · random tangent displacement
//   6. position p = Cᵢ(t) + u·N + s·T
//   7. domain warp via a precomputed 96×96 grid + bilinear interpolation
//      — same math as the per-particle call but ~20× cheaper
//   8. compute pigment RYB as mix of ribbon's endpoints at t, with a
//      saturation boost at the core so centerlines glow hotter than tails
//   9. deposit rgb·mass (emission) into an accumulation buffer at p'
//
// final pass — emissive tonemap instead of Beer-Lambert:
//   pixel[c] = substrate[c] + (1 − exp(−A[c] · exposure))
//   + fleck noise ·  grain
//   apply sRGB gamma and write to ImageData.
// the additive model means dark substrates just work — pigment glows
// from nothing, never gets muddied by paper subtraction.
// ---------------------------------------------------------------

export type PigmentParams = {
  coreRadius: number      // 0..0.5 — gaussian half-width in UV units
  spreadRadius: number    // 0..0.8 — exp tail radius in UV units
  scatter: number         // 0..1   — along-tangent jitter in UV units (×0.1)
  warp: number            // 0..300 — recursive-warp amplitude (px scale)
  grain: number           // 0..10  — per-pixel absorbance noise
  ribbons: number         // 1..8
  harmonics: number       // 2..8   — Fourier terms per ribbon
  beta: number            // 1..3   — 1/k^β amplitude falloff
  density: number         // 5000..500000 — particle count
  palette: number         // index into PALETTES
  seed: number
}

export const DEFAULTS: PigmentParams = {
  coreRadius: 0.18,
  spreadRadius: 0.34,
  scatter: 0.22,
  warp: 210,
  grain: 2.2,
  ribbons: 4,
  harmonics: 6,
  beta: 1.4,
  density: 200000,
  palette: 0,       // river (first entry) after palette reshuffle
  seed: 0x9e37,
}

// substrate — deep, slightly-blue night. read as ink water seen at depth.
// kept in linear RGB; gamma applied at emit.
export const SUBSTRATE: RGB = [0.028, 0.033, 0.052]

// kept as an alias so existing `PAPER` imports keep working. the canvas
// is dark now; the name is historical.
export const PAPER: RGB = SUBSTRATE

type Ribbon = {
  cx: number                    // 0..1 — anchor x
  ampX: number                  // overall sway amplitude
  ampY: number                  // vertical kinking amplitude
  phi: number[]                 // per-harmonic phase for x
  freqs: number[]               // per-harmonic frequency for x
  amps: number[]                // per-harmonic amplitude for x (1/k^β)
  psi: number[]                 // per-harmonic phase for y
  gFreqs: number[]              // per-harmonic freq for y
  gAmps: number[]               // per-harmonic amp for y
  top: RGB                      // RYB at t=0
  bot: RGB                      // RYB at t=1
  slant: number                 // linear tilt (added to x proportional to t)
  tStart: number                // clipped range so ribbons can be shorter
  tEnd: number
  massBias: number              // 0.6..1.4 density weight
}

function buildRibbons(p: PigmentParams): Ribbon[] {
  const rand = mulberry32(p.seed)
  const palette = PALETTES[p.palette % PALETTES.length]
  const slots = palette.ribbons
  const out: Ribbon[] = []

  for (let i = 0; i < p.ribbons; i++) {
    const slot = slots[i % slots.length]
    const phi: number[] = [], psi: number[] = []
    const freqs: number[] = [], gFreqs: number[] = []
    const amps: number[] = [],  gAmps: number[] = []
    for (let k = 1; k <= p.harmonics; k++) {
      phi.push(rand() * Math.PI * 2)
      psi.push(rand() * Math.PI * 2)
      // integer-ish frequencies (with a small irrational kick for non-periodicity)
      freqs.push(k + (rand() - 0.5) * 0.3)
      gFreqs.push(k * 0.6 + (rand() - 0.5) * 0.3)
      amps.push(Math.pow(k, -p.beta))
      gAmps.push(0.35 * Math.pow(k, -p.beta))
    }
    out.push({
      cx: (i + 0.5) / p.ribbons + (rand() - 0.5) * 0.12,
      ampX: 0.12 + rand() * 0.18,
      ampY: 0.04 + rand() * 0.08,
      phi, psi, freqs, gFreqs, amps, gAmps,
      top: [...slot[0]] as RGB,
      bot: [...slot[1]] as RGB,
      slant: (rand() - 0.5) * 0.25,
      tStart: rand() * 0.12,
      tEnd: 1 - rand() * 0.12,
      massBias: 0.7 + rand() * 0.7,
    })
  }
  return out
}

// Cᵢ(t): evaluate the harmonic curve, write position into `pos`.
function curve(rib: Ribbon, t: number, pos: [number, number]) {
  let sx = 0, sy = 0
  for (let k = 0; k < rib.freqs.length; k++) {
    sx += rib.amps[k]  * Math.sin(2 * Math.PI * rib.freqs[k]  * t + rib.phi[k])
    sy += rib.gAmps[k] * Math.sin(2 * Math.PI * rib.gFreqs[k] * t + rib.psi[k])
  }
  pos[0] = rib.cx + rib.ampX * sx + rib.slant * (t - 0.5)
  pos[1] = t + rib.ampY * sy
}

// Tangent via analytic derivative. Normalized into `tan`.
function tangent(rib: Ribbon, t: number, tan: [number, number]) {
  let dx = 0, dy = 1 // dy baseline from t → y
  for (let k = 0; k < rib.freqs.length; k++) {
    const fx = rib.freqs[k], fy = rib.gFreqs[k]
    dx += rib.amps[k]  * 2 * Math.PI * fx * Math.cos(2 * Math.PI * fx * t + rib.phi[k])
    dy += rib.gAmps[k] * 2 * Math.PI * fy * Math.cos(2 * Math.PI * fy * t + rib.psi[k])
  }
  dx = rib.ampX * dx + rib.slant
  dy = 1 + rib.ampY * (dy - 1)
  const L = Math.hypot(dx, dy) || 1
  tan[0] = dx / L
  tan[1] = dy / L
}

// width bell: bell-shaped envelope so ribbons taper at head/tail.
// w(t) = (1 − (2s − 1)²)^α where s maps [tStart, tEnd] → [0, 1].
function widthEnv(rib: Ribbon, t: number): number {
  if (t <= rib.tStart || t >= rib.tEnd) return 0
  const s = (t - rib.tStart) / (rib.tEnd - rib.tStart)
  const b = 1 - (2 * s - 1) * (2 * s - 1)
  return Math.pow(Math.max(0, b), 0.65)
}

// linear→sRGB gamma
function toSrgb(v: number): number {
  v = Math.max(0, Math.min(1, v))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

// ---------------------------------------------------------------
// main generator — writes into the given ImageData. Synchronous.
// ---------------------------------------------------------------

const WARP_GRID = 96          // resolution of the cached domain-warp offsets
const EMISSION_EXPOSURE = 1.35 // final tonemap gain — higher = hotter highlights

export function generate(img: ImageData, params: PigmentParams): void {
  const W = img.width, H = img.height
  const ribs = buildRibbons(params)

  // emission buffer: additive color per channel, stride 3.
  const dens = new Float32Array(W * H * 3)

  const pos: [number, number] = [0, 0]
  const tan: [number, number] = [0, 0]
  const tmpMix: RGB = [0, 0, 0]
  const tmpRgb: RGB = [0, 0, 0]

  const rand = mulberry32(params.seed ^ 0xa5a5)
  const warpScale = 3.2                             // base frequency for warp fbm
  const warpAmp = params.warp / Math.max(W, H)      // px → UV
  const coreSigma = params.coreRadius * 0.18        // UV
  const spreadSigma = params.spreadRadius * 0.22    // UV
  const tangentJitter = params.scatter * 0.10       // UV

  // ---- precomputed warp grid ----
  // the old code called recursive vfbm once per particle (~10 noise taps each)
  // so at 200k particles we were doing ~2 M Perlin evaluations per render.
  // bake it onto a 96×96 lattice of warp *offsets* (dx, dy) in UV space, then
  // bilinear-sample per particle. ~9k evaluations total + trivial sample cost.
  let warpCache: Float32Array | null = null
  if (warpAmp > 0) {
    warpCache = new Float32Array(WARP_GRID * WARP_GRID * 2)
    const tmp: [number, number] = [0, 0]
    for (let gy = 0; gy < WARP_GRID; gy++) {
      const uy = gy / (WARP_GRID - 1)
      for (let gx = 0; gx < WARP_GRID; gx++) {
        const ux = gx / (WARP_GRID - 1)
        warp(ux * warpScale, uy * warpScale, warpAmp * 0.5, 1, tmp)
        const i = (gy * WARP_GRID + gx) * 2
        warpCache[i    ] = tmp[0] / warpScale - ux
        warpCache[i + 1] = tmp[1] / warpScale - uy
      }
    }
  }

  const totalLen = ribs.reduce((s, r) => s + r.massBias * (r.tEnd - r.tStart), 0) || 1

  for (let i = 0; i < ribs.length; i++) {
    const rib = ribs[i]
    const share = rib.massBias * (rib.tEnd - rib.tStart) / totalLen
    const n = Math.max(1, Math.round(params.density * share))

    for (let k = 0; k < n; k++) {
      // t stratified across [tStart, tEnd]
      const t = rib.tStart + (rib.tEnd - rib.tStart) * ((k + rand()) / n)
      curve(rib, t, pos)
      tangent(rib, t, tan)
      const nx = -tan[1], ny = tan[0]
      const env = widthEnv(rib, t)
      if (env <= 0) continue

      // mixture draw: gaussian core with prob 0.7, exp tail otherwise
      let u: number, coreHit: boolean
      if (rand() < 0.7) {
        u = gaussian(rand(), rand()) * coreSigma * env
        coreHit = true
      } else {
        const sign = rand() < 0.5 ? -1 : 1
        u = sign * expDraw(rand()) * spreadSigma * env
        coreHit = false
      }

      // tangent scatter — particle drifts along flow direction
      const sJ = (rand() - 0.5) * 2 * tangentJitter * env

      let x = pos[0] + u * nx + sJ * tan[0]
      let y = pos[1] + u * ny + sJ * tan[1]

      // bilinear warp-cache lookup — same result as the old per-particle
      // `warp(...)` call, ~20× cheaper.
      if (warpCache) {
        const gx = Math.max(0, Math.min(1, x)) * (WARP_GRID - 1)
        const gy = Math.max(0, Math.min(1, y)) * (WARP_GRID - 1)
        const gxi = Math.min(WARP_GRID - 2, Math.floor(gx))
        const gyi = Math.min(WARP_GRID - 2, Math.floor(gy))
        const fx = gx - gxi, fy = gy - gyi
        const i00 = (gyi * WARP_GRID + gxi) * 2
        const i10 = i00 + 2
        const i01 = i00 + WARP_GRID * 2
        const i11 = i01 + 2
        const dxw =
          warpCache[i00    ] * (1 - fx) * (1 - fy) +
          warpCache[i10    ] * fx       * (1 - fy) +
          warpCache[i01    ] * (1 - fx) * fy       +
          warpCache[i11    ] * fx       * fy
        const dyw =
          warpCache[i00 + 1] * (1 - fx) * (1 - fy) +
          warpCache[i10 + 1] * fx       * (1 - fy) +
          warpCache[i01 + 1] * (1 - fx) * fy       +
          warpCache[i11 + 1] * fx       * fy
        x += dxw
        y += dyw
      }

      // RYB color: interpolate along t. at the core we bias toward
      // saturated/brighter values; at the exponential tail we let hue
      // drift toward the complementary partner for gorgeous fringe colors.
      mixRyb(rib.top, rib.bot, t, tmpMix)
      if (!coreHit) {
        // subtle hue-rotate toward edge-accent
        const edgeBias = Math.min(1, Math.abs(u) / Math.max(spreadSigma * env, 1e-6))
        tmpMix[0] = Math.max(0, Math.min(1, tmpMix[0] + 0.08 * edgeBias))
        tmpMix[2] = Math.max(0, Math.min(1, tmpMix[2] + 0.18 * edgeBias))
      }
      rybToRgb(tmpMix[0], tmpMix[1], tmpMix[2], tmpRgb)

      // core particles carry more mass; particles sitting exactly on the
      // centerline also get a small luminance bonus so the rivers read
      // hotter in the middle and cooler at the edges.
      const centerBoost = coreHit ? (1 + 0.9 * Math.exp(-(u * u) / (coreSigma * coreSigma * env * env + 1e-9))) : 1
      const mass = (coreHit ? 0.55 : 0.22) * env * centerBoost

      // convert UV → pixel. y axis: top (0) → bottom (H)
      const px = x * W
      const py = y * H
      if (px < 0 || px >= W - 1 || py < 0 || py >= H - 1) continue

      // bilinear splat (4 neighbors) — smoother than 1-pixel writes
      const xi = Math.floor(px), yi = Math.floor(py)
      const fxP = px - xi, fyP = py - yi
      const w00 = (1 - fxP) * (1 - fyP)
      const w10 = fxP * (1 - fyP)
      const w01 = (1 - fxP) * fyP
      const w11 = fxP * fyP

      const r = tmpRgb[0] * mass
      const g = tmpRgb[1] * mass
      const b = tmpRgb[2] * mass

      const i00p = (yi * W + xi) * 3
      dens[i00p    ] += r * w00
      dens[i00p + 1] += g * w00
      dens[i00p + 2] += b * w00
      const i10p = i00p + 3
      dens[i10p    ] += r * w10
      dens[i10p + 1] += g * w10
      dens[i10p + 2] += b * w10
      const i01p = i00p + W * 3
      dens[i01p    ] += r * w01
      dens[i01p + 1] += g * w01
      dens[i01p + 2] += b * w01
      const i11p = i01p + 3
      dens[i11p    ] += r * w11
      dens[i11p + 1] += g * w11
      dens[i11p + 2] += b * w11
    }
  }

  // ---- final pass: substrate + (1 − exp(−A · exposure)) + speckle grain ----
  // emissive tonemap gives a gentle highlight rolloff, so high-mass core
  // pixels saturate toward their rgb rather than clip to pure white.
  const data = img.data
  const sub0 = SUBSTRATE[0], sub1 = SUBSTRATE[1], sub2 = SUBSTRATE[2]
  const exposure = EMISSION_EXPOSURE

  // speckle grain — additive luminous noise, looks like suspended motes
  // in dark water. skip the per-pixel loop entirely when grain is zero.
  const grainAmp = Math.max(0, params.grain) * 0.006
  const grainBias = params.seed >>> 3
  const hash = (x: number) => {
    x = Math.imul(x ^ (x >>> 16), 2246822507)
    x = Math.imul(x ^ (x >>> 13), 3266489909)
    x ^= x >>> 16
    return (x / 2147483648) - 1
  }

  // subtle paper-like "depth" modulation — soft fbm darkening veins,
  // suggests currents beneath the surface. precompute on a 4-px grid.
  const blockSize = 4
  const gcols = Math.ceil(W / blockSize) + 1
  const grows = Math.ceil(H / blockSize) + 1
  const depth = new Float32Array(gcols * grows)
  const depthAmp = 0.012
  for (let j = 0; j < grows; j++) {
    for (let i = 0; i < gcols; i++) {
      depth[j * gcols + i] = fbm(i * 0.11, j * 0.11, 3) * depthAmp
    }
  }

  for (let yi = 0; yi < H; yi++) {
    for (let xi = 0; xi < W; xi++) {
      const di = (yi * W + xi) * 3
      const pi = (yi * W + xi) * 4

      // bilinear depth lookup
      const bx = xi / blockSize, by = yi / blockSize
      const bxi = Math.floor(bx), byi = Math.floor(by)
      const fbx = bx - bxi, fby = by - byi
      const b00 = depth[byi * gcols + bxi]
      const b10 = depth[byi * gcols + bxi + 1]
      const b01 = depth[(byi + 1) * gcols + bxi]
      const b11 = depth[(byi + 1) * gcols + bxi + 1]
      const bgv = b00 * (1 - fbx) * (1 - fby)
                + b10 * fbx       * (1 - fby)
                + b01 * (1 - fbx) * fby
                + b11 * fbx       * fby

      // emission tonemap: 1 − exp(−A · exposure). saturates at 1, preserving color.
      const ar = dens[di    ] * exposure
      const ag = dens[di + 1] * exposure
      const ab = dens[di + 2] * exposure
      let r = sub0 + bgv + (1 - Math.exp(-ar))
      let g = sub1 + bgv + (1 - Math.exp(-ag))
      let b = sub2 + bgv + (1 - Math.exp(-ab))

      // speckle — only fires where the pigment is nontrivial, so the
      // empty substrate stays clean and dark.
      if (grainAmp > 0) {
        const n = (
          hash(xi * 73856093 ^ yi * 19349663 ^ grainBias) * 0.6 +
          hash((xi >> 1) * 83492791 ^ (yi >> 1) * 25165877 ^ grainBias) * 0.4
        )
        const pigmentHere = Math.min(1, ar + ag + ab)
        const gr = n * grainAmp * pigmentHere
        r += gr; g += gr; b += gr
      }

      data[pi    ] = Math.round(toSrgb(r) * 255)
      data[pi + 1] = Math.round(toSrgb(g) * 255)
      data[pi + 2] = Math.round(toSrgb(b) * 255)
      data[pi + 3] = 255
    }
  }
}
