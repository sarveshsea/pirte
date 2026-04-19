import { useEffect, useMemo, useRef } from 'react'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { createMatrixRain } from '../modules/matrixRain'
import { stepClifford, DEFAULTS } from '../modules/attractors'
import { renderKaleidoscope } from '../modules/kaleidoscope'
import { RAMPS } from '../modules/asciiConvert'
import { renderSevenSegment } from '../modules/sevenSegment'
import { initState as spritesInit, step as spritesStep, render as spritesRender, type SpritesState } from '../modules/sprites'

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

export function ThumbSprites() {
  const preRef = useRef<HTMLPreElement>(null)
  const stateRef = useRef<SpritesState | null>(null)
  useEffect(() => { stateRef.current = spritesInit(34, 14, 22); stateRef.current.mode = 'attract'; stateRef.current.cursor.active = false }, [])
  useThrottledRaf(() => {
    const s = stateRef.current
    if (!s || !preRef.current) return
    // gentle idle wander
    s.cursor.x = s.cols / 2 + Math.cos(s.t * 0.3) * s.cols * 0.3
    s.cursor.y = s.rows / 2 + Math.sin(s.t * 0.4) * s.rows * 0.3
    s.cursor.active = true
    spritesStep(s, 1 / 24)
    preRef.current.textContent = spritesRender(s)
  })
  return <pre ref={preRef} className="m-0 whitespace-pre text-[9px] leading-[1.0] text-[var(--color-fg)]" />
}

export function ThumbWaves() {
  const ref = useRef<HTMLCanvasElement>(null)
  useThrottledRaf((t) => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    fitCanvas(c, ctx)
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#e8e8e8'
    ctx.lineWidth = 1
    ctx.beginPath()
    // synthetic multi-sine waveform to suggest audio
    for (let x = 0; x < W; x++) {
      const p = x / W
      const phase = t * 0.004
      const v =
        Math.sin(p * 28 + phase) * 0.35 +
        Math.sin(p * 11 + phase * 1.3) * 0.25 +
        Math.sin(p * 54 + phase * 2.1) * 0.12
      const y = H / 2 + v * H * 0.34
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // spectrum bars underneath
    ctx.fillStyle = '#6e6e6e'
    for (let i = 0; i < 32; i++) {
      const h = Math.abs(Math.sin(i * 0.6 + t * 0.002)) * H * 0.22
      ctx.fillRect(i * (W / 32), H - h - 2, Math.max(1, W / 32 - 2), h)
    }
  })
  return <canvas ref={ref} className="block h-full w-full" />
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
