export type RGB = [number, number, number]
export type PuzzleSource =
  | { kind: 'random'; seed: string }
  | { kind: 'upload'; name: string }
  | { kind: 'url'; url: string }

export type Puzzle = {
  size: number
  palette: RGB[]       // index = number label
  cells: Uint8Array    // palette index per cell
  source: PuzzleSource
  thumbUrl: string     // low-res data url of the quantized result, for preview
}

function dist2(a: RGB, b: RGB): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

// median-cut quantization → k colors
function medianCut(pixels: RGB[], k: number): RGB[] {
  const buckets: RGB[][] = [pixels]
  while (buckets.length < k) {
    let bestIdx = 0, bestRange = -1
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]
      if (b.length < 2) continue
      let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
      for (const p of b) {
        if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0]
        if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1]
        if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2]
      }
      const range = Math.max(maxR - minR, maxG - minG, maxB - minB)
      if (range > bestRange) { bestRange = range; bestIdx = i }
    }
    if (bestRange <= 0) break
    const bucket = buckets[bestIdx]
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
    for (const p of bucket) {
      if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0]
      if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1]
      if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2]
    }
    const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB
    const ch = rR >= rG && rR >= rB ? 0 : rG >= rB ? 1 : 2
    bucket.sort((a, b) => a[ch] - b[ch])
    const mid = Math.floor(bucket.length / 2)
    buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid))
  }
  return buckets.map((b) => {
    let r = 0, g = 0, bl = 0
    for (const p of b) { r += p[0]; g += p[1]; bl += p[2] }
    const n = Math.max(1, b.length)
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] as RGB
  })
}

// only accept schemes that are safe for canvas/image sources. 'javascript:' is
// a no-op in <img> but still rejected for defense-in-depth; 'file:' and other
// unknown protocols can read local context in some environments.
const OK_SCHEMES = new Set(['https:', 'http:', 'data:', 'blob:'])

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    try {
      const url = new URL(src, window.location.href)
      if (!OK_SCHEMES.has(url.protocol)) {
        rej(new Error(`blocked image scheme: ${url.protocol}`))
        return
      }
    } catch {
      rej(new Error('invalid image url'))
      return
    }
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => res(el)
    el.onerror = () => rej(new Error('image failed to load'))
    el.src = src
  })
}

// draw the source into an offscreen canvas with a square center-crop, then
// quantize + median-cut to produce a Puzzle.
function quantizeImage(img: HTMLImageElement, size: number, colors: number): {
  palette: RGB[]; cells: Uint8Array; thumbUrl: string
} {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  // center-crop to square
  const sw = img.naturalWidth, sh = img.naturalHeight
  const s = Math.min(sw, sh)
  const sx = Math.floor((sw - s) / 2), sy = Math.floor((sh - s) / 2)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]])

  const sampled = pixels.length > 4096
    ? Array.from({ length: 4096 }, () => pixels[Math.floor(Math.random() * pixels.length)])
    : pixels
  const palette = medianCut(sampled, colors)

  const cells = new Uint8Array(size * size)
  for (let i = 0; i < pixels.length; i++) {
    let best = 0, bestD = Infinity
    for (let p = 0; p < palette.length; p++) {
      const d = dist2(pixels[i], palette[p])
      if (d < bestD) { bestD = d; best = p }
    }
    cells[i] = best
  }

  // redraw quantized cells onto the canvas for a thumbnail data url
  const img2 = ctx.createImageData(size, size)
  for (let i = 0; i < cells.length; i++) {
    const rgb = palette[cells[i]]
    const j = i * 4
    img2.data[j] = rgb[0]; img2.data[j + 1] = rgb[1]; img2.data[j + 2] = rgb[2]; img2.data[j + 3] = 255
  }
  ctx.putImageData(img2, 0, 0)
  const thumbUrl = c.toDataURL('image/png')
  return { palette, cells, thumbUrl }
}

export async function buildFromImage(img: HTMLImageElement, size: number, colors: number, source: PuzzleSource): Promise<Puzzle> {
  const q = quantizeImage(img, size, colors)
  return { size, palette: q.palette, cells: q.cells, source, thumbUrl: q.thumbUrl }
}

export async function buildFromSeed(size: number, colors: number, seed: string): Promise<Puzzle> {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size * 4}/${size * 4}`
  const img = await loadImage(url)
  return buildFromImage(img, size, colors, { kind: 'random', seed })
}

export async function buildFromFile(file: File, size: number, colors: number): Promise<Puzzle> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await loadImage(dataUrl)
  return buildFromImage(img, size, colors, { kind: 'upload', name: file.name })
}

export async function buildFromUrl(url: string, size: number, colors: number): Promise<Puzzle> {
  const img = await loadImage(url)
  return buildFromImage(img, size, colors, { kind: 'url', url })
}
