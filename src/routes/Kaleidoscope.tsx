import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { fitCanvas, prefersReducedMotion } from '../lib/canvas'
import { createKaleidoscope } from '../modules/kaleidoscope/engine'
import { PALETTES, PALETTE_NAMES } from '../modules/kaleidoscope/palettes'

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

  const [n,     setN]     = useState(() => clampInt(params.get('n'), 3, 12, 6))
  const [scale, setScale] = useState(() => clampInt(params.get('s'), 4, 60, 18))
  const [speed, setSpeed] = useState(() => clampNum(params.get('v'), 0, 2, 0.6))
  const [palIdx, setPalIdx] = useState(() => clampInt(params.get('p'), 0, PALETTES.length - 1, 0))
  const [sound, setSound] = useState(() => params.get('a') === '1')
  const [paused, setPaused] = useState(false)

  const engine = useMemo(() => createKaleidoscope({ n, scale, speed }), [])

  // throttled url sync
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        p.set('n', String(n))
        p.set('s', String(scale))
        p.set('v', speed.toFixed(2))
        p.set('p', String(palIdx))
        if (sound) p.set('a', '1'); else p.delete('a')
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [n, scale, speed, palIdx, sound, setParams])

  // push setters into engine on change
  useEffect(() => { engine.setN(n) }, [engine, n])
  useEffect(() => { engine.setScale(scale) }, [engine, scale])
  useEffect(() => { engine.setSpeed(speed) }, [engine, speed])
  useEffect(() => { engine.setPaused(paused) }, [engine, paused])
  useEffect(() => { engine.setPalette(palIdx) }, [engine, palIdx])
  useEffect(() => { engine.setSoundOn(sound) }, [engine, sound])

  // raf + resize + pointer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const resize = () => {
      fitCanvas(canvas, ctx)
      const rect = canvas.getBoundingClientRect()
      engine.setSize(rect.width, rect.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const reduce = prefersReducedMotion()

    const loop = (now: number) => {
      engine.frame(ctx, now)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) engine.frame(ctx, performance.now())
    else raf = requestAnimationFrame(loop)

    const toLocal = (e: PointerEvent | MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const r = Math.min(rect.width, rect.height) * 0.48
      return { x: (e.clientX - cx) / r, y: (e.clientY - cy) / r }
    }

    const onMove = (e: PointerEvent) => {
      const p = toLocal(e)
      engine.setCursor(p.x, p.y)
      engine.setCursorActive(true)
    }
    const onLeave = () => engine.setCursorActive(false)
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      engine.click(e.clientX - cx, e.clientY - cy)
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerdown', onDown)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
    }
  }, [engine])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); return }
      const k = e.key.toLowerCase()
      if (k === 'c') setPalIdx((i) => (i + 1) % PALETTES.length)
      else if (k === 'm') setSound((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const paletteName = PALETTE_NAMES[palIdx]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <Tile
        label={`kaleidoscope · ${paletteName}`}
        code="07"
        footer={<span>tilt the cursor · click to drop · c palette · m sound · space {paused ? 'resume' : 'pause'}</span>}
      >
        <canvas ref={canvasRef} className="block h-[72vh] w-full" />
      </Tile>
      <Tile label="params">
        <div className="flex h-full flex-col gap-3 p-3">
          <Slider label="symmetry" min={3} max={12} step={1}    value={n}     onChange={setN} />
          <Slider label="scale"    min={4} max={60} step={1}    value={scale} onChange={setScale} />
          <Slider label="speed"    min={0} max={2}  step={0.01} value={speed} onChange={setSpeed} format={(v) => v.toFixed(2)} />
          <div className="mt-2 flex flex-col gap-2">
            <button
              data-interactive
              onClick={() => setPalIdx((i) => (i + 1) % PALETTES.length)}
              title="cycle palette · c"
            >
              palette · {paletteName}
            </button>
            <button
              data-interactive
              onClick={() => setSound((v) => !v)}
              title="toggle sound · m"
            >
              sound · {sound ? 'on' : 'off'}
            </button>
            <button data-interactive onClick={() => setPaused((v) => !v)}>
              {paused ? 'resume' : 'pause'}
            </button>
          </div>
          <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-dim)]">
            shards obey cursor gravity. each mirror-wall hit tinkles. ambient drone pitches with symmetry.
          </div>
        </div>
      </Tile>
    </div>
  )
}
