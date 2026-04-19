import { noise2 } from '../lib/perlin'

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return [r * 255, g * 255, b * 255]
}

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
      const theta = Math.atan2(dy, dx)
      let wrap = ((theta % (2 * wedge)) + 2 * wedge) % (2 * wedge)
      if (wrap > wedge) wrap = 2 * wedge - wrap
      const wx = Math.cos(wrap) * r
      const wy = Math.sin(wrap) * r
      const s = scale / Math.max(w, h)
      const nA = noise2(wx * s + t * 0.08, wy * s)
      const nB = noise2(wx * s, wy * s + t * 0.08 + 41.2)
      const v = (nA + nB) * 0.5 + Math.sin(r * 0.03 + t * 0.3) * 0.1
      const lum = Math.max(0, Math.min(1, v * 0.5 + 0.5))
      const hue = (nA * 0.35 + t * 0.015 + 0.6) % 1
      const sat = 0.45 + Math.abs(nB) * 0.25
      const [R, G, B] = hsv2rgb((hue + 1) % 1, Math.max(0, Math.min(1, sat)), lum)
      const i = (y * w + x) * 4
      data[i] = R
      data[i + 1] = G
      data[i + 2] = B
      data[i + 3] = 255
    }
  }
}
