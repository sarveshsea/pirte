// ring buffer + unicode block sparkline ▁▂▃▄▅▆▇█

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

export type SparkBuf = {
  readonly size: number
  push(v: number): void
  render(width?: number): string
  last(): number
}

export function createSparkBuf(size = 48): SparkBuf {
  const buf = new Float32Array(size)
  let i = 0
  let filled = 0

  return {
    size,
    push(v: number) {
      buf[i] = v
      i = (i + 1) % size
      if (filled < size) filled++
    },
    render(width = size): string {
      if (filled === 0) return ''
      const w = Math.min(width, filled)
      // read last w samples in chronological order
      const start = (i - w + size) % size
      let min = Infinity, max = -Infinity
      for (let k = 0; k < w; k++) {
        const v = buf[(start + k) % size]
        if (v < min) min = v
        if (v > max) max = v
      }
      const span = max - min || 1
      let out = ''
      for (let k = 0; k < w; k++) {
        const v = buf[(start + k) % size]
        const t = (v - min) / span
        const idx = Math.max(0, Math.min(BLOCKS.length - 1, Math.floor(t * BLOCKS.length)))
        out += BLOCKS[idx]
      }
      return out
    },
    last(): number {
      if (filled === 0) return 0
      const idx = (i - 1 + size) % size
      return buf[idx]
    },
  }
}
