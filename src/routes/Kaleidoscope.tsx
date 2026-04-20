import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { renderKaleidoscope } from '../modules/kaleidoscope'

function clampInt(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fb
}
function clampNum(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fb
}

export default function Kaleidoscope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [params, setParams] = useSearchParams()
  const [n, setN] = useState(() => clampInt(params.get('n'), 3, 12, 6))
  const [scale, setScale] = useState(() => clampInt(params.get('s'), 4, 60, 18))
  const [speed, setSpeed] = useState(() => clampNum(params.get('v'), 0, 2, 0.6))
  const [paused, setPaused] = useState(false)

  // throttle URL writes to avoid history spam
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        p.set('n', String(n))
        p.set('s', String(scale))
        p.set('v', speed.toFixed(2))
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [n, scale, speed, setParams])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let t = 0
    let lastReal = performance.now()

    const resize = () => fitCanvas(canvas, ctx)
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const reduce = prefersReducedMotion()

    const render = () => {
      // render at reduced resolution then upscale for speed
      const rect = canvas.getBoundingClientRect()
      const rw = Math.max(120, Math.floor(rect.width / 2))
      const rh = Math.max(120, Math.floor(rect.height / 2))
      const buf = ctx.createImageData(rw, rh)
      renderKaleidoscope(buf, t, n, scale)
      // draw onto temporary canvas, scale up
      const off = document.createElement('canvas')
      off.width = rw; off.height = rh
      off.getContext('2d')!.putImageData(buf, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.drawImage(off, 0, 0, rect.width, rect.height)
    }

    const loop = (now: number) => {
      const dt = (now - lastReal) / 1000
      lastReal = now
      if (!paused) t += dt * speed
      render()
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) render()
    else raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v) }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [n, scale, speed, paused])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <Tile
        label="kaleidoscope"
        code="07"
        footer={<span>n-fold {n} · space {paused ? 'resume' : 'freeze'}</span>}
      >
        <canvas ref={canvasRef} className="block h-[72vh] w-full" />
      </Tile>
      <Tile label="params">
        <div className="flex h-full flex-col gap-3 p-3">
          <Slider label="symmetry" min={3}   max={12}  step={1}    value={n}     onChange={setN} />
          <Slider label="scale"    min={4}   max={60}  step={1}    value={scale} onChange={setScale} />
          <Slider label="speed"    min={0}   max={2}   step={0.01} value={speed} onChange={setSpeed} format={(v) => v.toFixed(2)} />
          <button data-interactive onClick={() => setPaused((v) => !v)}>{paused ? 'resume' : 'freeze'}</button>
        </div>
      </Tile>
    </div>
  )
}
