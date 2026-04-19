import { useEffect, useMemo, useRef } from 'react'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { createMatrixRain } from '../modules/matrixRain'
import { stepClifford, DEFAULTS } from '../modules/attractors'
import { renderKaleidoscope } from '../modules/kaleidoscope'
import { RAMPS } from '../modules/asciiConvert'
import { renderSevenSegment } from '../modules/sevenSegment'

const TARGET_FPS = 24
const FRAME_MS = 1000 / TARGET_FPS

function useThrottledRaf(draw: (t: number) => void, deps: unknown[] = []) {
  useEffect(() => {
    const reduce = prefersReducedMotion()
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      if (t - last >= FRAME_MS) {
        draw(t)
        last = t
      }
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) draw(0)
    else raf = requestAnimationFrame(loop)
    return () => { if (raf) cancelAnimationFrame(raf) }
    /* eslint-disable-next-line */
  }, deps)
}

export function ThumbMatrix() {
  const preRef = useRef<HTMLPreElement>(null)
  const scene = useMemo(() => createMatrixRain(), [])
  useEffect(() => { scene.reset(32, 14) }, [scene])
  useThrottledRaf((t) => {
    if (preRef.current) preRef.current.textContent = scene.frame(t)
  }, [scene])
  return <pre ref={preRef} className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]" />
}

export function ThumbClifford() {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ x: 0.1, y: 0.1 })
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    ctx.fillStyle = '#000'
    const r = c.getBoundingClientRect()
    ctx.fillRect(0, 0, r.width, r.height)
  }, [])
  useThrottledRaf(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const r = c.getBoundingClientRect()
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(0, 0, r.width, r.height)
    ctx.fillStyle = '#e8e8e8'
    for (let i = 0; i < 2500; i++) {
      stepClifford(stateRef.current, DEFAULTS.clifford)
      const px = r.width / 2 + stateRef.current.x * (r.width / 5)
      const py = r.height / 2 + stateRef.current.y * (r.height / 5)
      ctx.fillRect(px, py, 1, 1)
    }
  })
  return <canvas ref={ref} className="block h-full w-full" />
}

export function ThumbAscii() {
  // static gradient of the Detailed ramp
  const lines = useMemo(() => {
    const ramp = RAMPS.Detailed
    const cols = 38, rows = 14
    const out: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        const v = Math.abs(Math.sin(x * 0.2 + y * 0.4)) * (1 - y / rows)
        const idx = Math.floor(v * (ramp.length - 1))
        line += ramp[ramp.length - 1 - idx]
      }
      out.push(line)
    }
    return out.join('\n')
  }, [])
  return <pre className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]">{lines}</pre>
}

export function ThumbMandelbrot() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = Math.floor(rect.width), H = Math.floor(rect.height)
    const img = ctx.createImageData(W, H)
    const scale = 3
    const cx = -0.5, cy = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = cx + ((x / W) - 0.5) * scale * (W / H)
        const py = cy + (0.5 - (y / H)) * scale
        let zx = 0, zy = 0
        let i = 0
        const max = 80
        for (; i < max; i++) {
          const nx = zx * zx - zy * zy + px
          const ny = 2 * zx * zy + py
          zx = nx; zy = ny
          if (zx * zx + zy * zy > 4) break
        }
        const m = i >= max - 1 ? 0 : i / max
        const v = Math.floor(Math.pow(m, 0.5) * 255)
        const k = (y * W + x) * 4
        img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [])
  return <canvas ref={ref} className="block h-full w-full" />
}

export function ThumbPixels() {
  // static gradient grid — evokes the palette-grid feel without a network fetch
  const n = 14
  return (
    <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)` }}>
      {Array.from({ length: n * n }).map((_, i) => {
        const x = i % n, y = Math.floor(i / n)
        const v = Math.floor(((x * 17 + y * 31) % 7) / 6 * 255)
        return <div key={i} style={{ background: `rgb(${v},${v},${v})` }} className="border-[0.5px] border-[var(--color-bg)]" />
      })}
    </div>
  )
}

export function ThumbTime() {
  const preRef = useRef<HTMLPreElement>(null)
  useThrottledRaf(() => {
    if (!preRef.current) return
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    preRef.current.textContent = renderSevenSegment(`${hh}:${mm}:${ss}`)
  })
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <pre ref={preRef} className="m-0 whitespace-pre text-[var(--color-fg)] text-[10px] leading-[1.1]" />
    </div>
  )
}

export function ThumbKaleidoscope() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const rw = 80, rh = 80
    const buf = ctx.createImageData(rw, rh)
    renderKaleidoscope(buf, t * 0.001, 6, 14)
    const off = document.createElement('canvas')
    off.width = rw; off.height = rh
    off.getContext('2d')!.putImageData(buf, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.drawImage(off, 0, 0, rect.width, rect.height)
  })
  return <canvas ref={ref} className="block h-full w-full" />
}
