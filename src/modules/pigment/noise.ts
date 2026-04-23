import { noise2 } from '../../lib/perlin'

// fBm — fractional Brownian motion. Σ_{k=0..N-1} amp·noise(x·freq, y·freq)
// with lacunarity doubling freq and persistence halving amp per octave.
// Returns roughly (-1, 1).
export function fbm(x: number, y: number, oct = 4, lac = 2.0, pers = 0.5): number {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(fx, fy)
    norm += amp
    fx *= lac
    fy *= lac
    amp *= pers
  }
  return sum / (norm || 1)
}

// Vector fBm using two decorrelated offsets so x-channel and y-channel
// are independent. Gives a smooth 2D vector field in roughly (-1, 1)².
export function vfbm(x: number, y: number, oct = 4): [number, number] {
  return [
    fbm(x,              y,              oct),
    fbm(x + 113.271,    y + 71.537,     oct),
  ]
}

// Iñigo Quílez recursive domain warp:
//   q(p) = vfbm(p)
//   r(p) = vfbm(p + 4·q(p))
//   p'   = p + strength · r(p)
// Deep folds at high strength; smooth sway near zero.
// `out` is reused to avoid per-call allocations.
export function warp(
  x: number, y: number,
  strength: number,
  scale: number,
  out: [number, number] = [0, 0],
): [number, number] {
  const sx = x * scale, sy = y * scale
  const [qx, qy] = vfbm(sx,              sy,              2)
  const [rx, ry] = vfbm(sx + 4 * qx,     sy + 4 * qy,     4)
  out[0] = x + strength * rx
  out[1] = y + strength * ry
  return out
}

// Curl of a scalar potential ψ: v = (∂ψ/∂y, -∂ψ/∂x). Divergence-free, so
// particles advected along it never pile up or diverge — good for
// laminar, streamline-like flow. We approximate the derivatives with
// central differences on fbm.
export function curl(x: number, y: number, eps = 0.01): [number, number] {
  const fxp = fbm(x, y + eps, 3)
  const fxn = fbm(x, y - eps, 3)
  const fyp = fbm(x + eps, y, 3)
  const fyn = fbm(x - eps, y, 3)
  const dy = (fxp - fxn) / (2 * eps)
  const dx = (fyp - fyn) / (2 * eps)
  return [dy, -dx]
}

// Box-Muller: two uniform samples → one standard-normal sample.
export function gaussian(u1: number, u2: number): number {
  const a = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-9)))
  const b = 2 * Math.PI * u2
  return a * Math.cos(b)
}

// Exponential tail draw (rate λ=1): heavy-tailed distribution for
// the "spread" skirt beyond the gaussian core.
export function expDraw(u: number): number {
  return -Math.log(Math.max(u, 1e-9))
}
