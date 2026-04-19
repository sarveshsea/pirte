import { noise2 } from '../lib/perlin'

export function renderKaleidoscope(
  img: ImageData,
  t: number,
  n: number,
  scale: number,
) {
  const w = img.width
  const h = img.height
  const data = img.data
  const cx = w / 2
  const cy = h / 2
  const wedge = Math.PI / n

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      let theta = Math.atan2(dy, dx)
      // fold
      let wrap = ((theta % (2 * wedge)) + 2 * wedge) % (2 * wedge)
      if (wrap > wedge) wrap = 2 * wedge - wrap
      const wx = Math.cos(wrap) * r
      const wy = Math.sin(wrap) * r
      // sample noise in wedge space
      const s = scale / Math.max(w, h)
      const nA = noise2(wx * s + t * 0.08, wy * s)
      const nB = noise2(wx * s, wy * s + t * 0.08 + 41.2)
      const v = (nA + nB) * 0.5 + Math.sin(r * 0.03 + t * 0.3) * 0.1
      const lum = Math.max(0, Math.min(255, Math.floor((v * 0.5 + 0.5) * 255)))
      const i = (y * w + x) * 4
      data[i] = lum
      data[i + 1] = lum
      data[i + 2] = lum
      data[i + 3] = 255
    }
  }
}
