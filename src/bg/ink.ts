import { noise2 } from '../lib/perlin'
import type { BgProgram } from './program'

// offscreen pixel covers SCALE × SCALE viewport px. upscaled with smoothing,
// which gives the watercolor softness essentially for free.
const SCALE = 14

// 3-octave fbm. iterated calls produce the domain-warp ribbons.
function fbm(x: number, y: number): number {
  let v = 0, a = 0.5, fx = x, fy = y
  for (let i = 0; i < 3; i++) {
    v += a * noise2(fx, fy)
    fx *= 2; fy *= 2; a *= 0.5
  }
  return v
}

export function createInk(): BgProgram {
  let viewW = 0, viewH = 0
  let w = 0, h = 0
  let off: HTMLCanvasElement | null = null
  let offCtx: CanvasRenderingContext2D | null = null
  let img: ImageData | null = null

  return {
    name: 'ink',
    reset(cols, rows, cell) {
      viewW = cols * cell
      viewH = rows * cell
      w = Math.max(8, Math.floor(viewW / SCALE))
      h = Math.max(8, Math.floor(viewH / SCALE))
      off = document.createElement('canvas')
      off.width = w
      off.height = h
      offCtx = off.getContext('2d', { alpha: true })
      if (offCtx) img = offCtx.createImageData(w, h)
    },
    frame(ctx, t, _dt, cursor, ripples) {
      if (!off || !offCtx || !img) return
      const time = t * 0.00004
      const data = img.data

      const cxPx = cursor.x / SCALE
      const cyPx = cursor.y / SCALE
      const cursorRad = 160 / SCALE
      const cursorRad2 = cursorRad * cursorRad

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x * 0.018
          const ny = y * 0.018

          let wx = 0, wy = 0

          if (cursor.active) {
            const dx = x - cxPx, dy = y - cyPx
            const d2 = dx * dx + dy * dy
            if (d2 < cursorRad2) {
              const d = Math.sqrt(d2) || 1
              const f = 1 - d / cursorRad
              wx += (dx / d) * f * 0.9
              wy += (dy / d) * f * 0.9
            }
          }

          for (let ri = 0; ri < ripples.length; ri++) {
            const rip = ripples[ri]
            const rxp = rip.x / SCALE
            const ryp = rip.y / SCALE
            const dx = x - rxp, dy = y - ryp
            const d = Math.hypot(dx, dy)
            const ringR = (rip.age * 240) / SCALE
            const ringW = 28 / SCALE
            const delta = Math.abs(d - ringR)
            if (delta < ringW) {
              const amp = (1 - delta / ringW) * Math.max(0, 1 - rip.age / 0.8)
              const dir = d > 0.001 ? 1 / d : 0
              wx += dx * dir * amp * 1.1
              wy += dy * dir * amp * 1.1
            }
          }

          // domain warping: two warp passes, then final sample
          const qx = fbm(nx + time,             ny + time * 0.6)
          const qy = fbm(nx + time * 0.8 + 5.2, ny + time * 0.9 + 1.3)
          const rx = fbm(nx + 4 * qx + wx,       ny + 4 * qy + wy)
          const ry = fbm(nx + 4 * qx + wx + 1.7, ny + 4 * qy + wy + 9.2)
          const v  = fbm(nx + 4 * rx,            ny + 4 * ry)

          // v is roughly [-0.6, 0.6]; remap to [0, 1]
          let mix = v * 0.85 + 0.5
          if (mix < 0) mix = 0
          else if (mix > 1) mix = 1

          // two-hue lerp: cool indigo → violet. feels trippy + clean.
          // hsl(220, 55%, 62%) ≈ (0.42, 0.58, 0.84)
          // hsl(285, 50%, 60%) ≈ (0.72, 0.44, 0.82)
          const R = ((0.42 * (1 - mix) + 0.72 * mix) * 255) | 0
          const G = ((0.58 * (1 - mix) + 0.44 * mix) * 255) | 0
          const B = ((0.84 * (1 - mix) + 0.82 * mix) * 255) | 0
          const A = (42 + mix * 8) | 0  // ~0.16–0.20 alpha

          const idx = (y * w + x) * 4
          data[idx]     = R
          data[idx + 1] = G
          data[idx + 2] = B
          data[idx + 3] = A
        }
      }

      offCtx.putImageData(img, 0, 0)
      // wipe the faded-trail residue from GridBackground before we blit
      ctx.clearRect(0, 0, viewW, viewH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, w, h, 0, 0, viewW, viewH)
    },
  }
}
