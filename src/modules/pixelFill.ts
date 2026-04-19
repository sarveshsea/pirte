export type RGB = [number, number, number]
export type Puzzle = {
  size: number
  palette: RGB[] // index = number label
  cells: Uint8Array // palette index per cell
  imageUrl: string
}

function dist2(a: RGB, b: RGB): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

// Median-cut quantization → k colors
function medianCut(pixels: RGB[], k: number): RGB[] {
  let buckets: RGB[][] = [pixels]
  while (buckets.length < k) {
    // pick bucket with greatest range
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
    // split along widest channel
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
    const a = bucket.slice(0, mid)
    const b = bucket.slice(mid)
    buckets.splice(bestIdx, 1, a, b)
  }
  return buckets.map((b) => {
    let r = 0, g = 0, bl = 0
    for (const p of b) { r += p[0]; g += p[1]; bl += p[2] }
    const n = Math.max(1, b.length)
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] as RGB
  })
}

export async function buildPuzzle(size: number, colors: number, seed: string): Promise<Puzzle> {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size * 4}/${size * 4}`
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => res(el)
    el.onerror = rej
    el.src = url
  })
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]])

  // sample subset for speed
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
  return { size, palette, cells, imageUrl: url }
}
