export const RAMPS: Record<string, string> = {
  Standard: '@%#*+=-:. ',
  Blocks: '█▓▒░ ',
  Detailed: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  Minimal: '# . ',
}

export type Tone = { brightness: number; contrast: number; gamma: number }
export type Sampling = { width: number; heightScale: number; pixelate: number }

export type ConvertOptions = {
  ramp: string
  densityBias: number // 0..2, 1 = neutral
  invert: boolean
  tone: Tone
  sampling: Sampling
}

export type AsciiFrame = {
  cols: number
  rows: number
  chars: string
  colors?: Uint8ClampedArray // rgba per cell when mode=original
}

function adjust(v: number, tone: Tone, densityBias: number): number {
  let x = v / 255
  x = (x - 0.5) * tone.contrast + 0.5 + tone.brightness
  x = Math.max(0, Math.min(1, x))
  x = Math.pow(x, 1 / Math.max(0.0001, tone.gamma))
  x = Math.pow(x, 1 / Math.max(0.0001, densityBias))
  return Math.max(0, Math.min(1, x))
}

export function convert(img: HTMLImageElement | HTMLCanvasElement, opts: ConvertOptions, captureColors = false): AsciiFrame {
  const srcW = 'naturalWidth' in img ? img.naturalWidth : img.width
  const srcH = 'naturalHeight' in img ? img.naturalHeight : img.height
  const aspect = srcH / srcW
  const cols = Math.max(10, Math.floor(opts.sampling.width))
  const rows = Math.max(4, Math.floor(cols * aspect * opts.sampling.heightScale * 0.5))

  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = opts.sampling.pixelate <= 0
  if (opts.sampling.pixelate > 0) {
    const step = Math.max(1, opts.sampling.pixelate + 1)
    const w = Math.max(1, Math.floor(cols / step))
    const h = Math.max(1, Math.floor(rows / step))
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    const tctx = tmp.getContext('2d')!
    tctx.imageSmoothingEnabled = false
    tctx.drawImage(img, 0, 0, w, h)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, cols, rows)
  } else {
    ctx.drawImage(img, 0, 0, cols, rows)
  }

  const data = ctx.getImageData(0, 0, cols, rows).data
  const ramp = opts.ramp
  const lastIdx = ramp.length - 1
  let chars = ''
  const colors = captureColors ? new Uint8ClampedArray(cols * rows * 4) : undefined

  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 8) { line += ' '; continue }
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      let t = adjust(lum, opts.tone, opts.densityBias)
      if (opts.invert) t = 1 - t
      const ci = Math.max(0, Math.min(lastIdx, Math.floor(t * lastIdx)))
      line += ramp[ci]
      if (colors) {
        const j = (y * cols + x) * 4
        colors[j] = r; colors[j + 1] = g; colors[j + 2] = b; colors[j + 3] = 255
      }
    }
    chars += line + (y < rows - 1 ? '\n' : '')
  }
  return { cols, rows, chars, colors }
}
