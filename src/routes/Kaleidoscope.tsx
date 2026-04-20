import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { prefersReducedMotion } from '../lib/canvas'
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
  const preRef  = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => { engine.setN(n) }, [engine, n])
  useEffect(() => { engine.setScale(scale) }, [engine, scale])
  useEffect(() => { engine.setSpeed(speed) }, [engine, speed])
  useEffect(() => { engine.setPaused(paused) }, [engine, paused])
  useEffect(() => { engine.setPalette(palIdx) }, [engine, palIdx])
  useEffect(() => { engine.setSoundOn(sound) }, [engine, sound])

  useEffect(() => {
    const pre = preRef.current
    const wrap = wrapRef.current
    if (!pre || !wrap) return
    let raf = 0
    let cellW = 8
    let cellH = 16

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      cellW = probe.getBoundingClientRect().width || 8
      cellH = probe.getBoundingClientRect().height || 16
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      const cols = Math.max(30, Math.floor(rect.width / cellW))
      const rows = Math.max(18, Math.floor(rect.height / cellH))
      engine.setSize(cols, rows)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    const reduce = prefersReducedMotion()
    const loop = (now: number) => {
      pre.innerHTML = engine.frame(now)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) pre.innerHTML = engine.frame(performance.now())
    else raf = requestAnimationFrame(loop)

    const toLocal = (e: PointerEvent): { x: number; y: number } => {
      const rect = wrap.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const r = Math.min(rect.width, rect.height) * 0.5
      return { x: (e.clientX - cx) / r, y: (e.clientY - cy) / r }
    }
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e)
      engine.setCursor(p.x, p.y)
      engine.setCursorActive(true)
    }
    const onLeave = () => engine.setCursorActive(false)
    const onDown = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      engine.click(e.clientX - rect.left, e.clientY - rect.top, cellW, cellH)
    }
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerleave', onLeave)
    wrap.addEventListener('pointerdown', onDown)

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerleave', onLeave)
      wrap.removeEventListener('pointerdown', onDown)
    }
  }, [engine])

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
        footer={<span>cursor warps · click pulses · c palette · m sound · space {paused ? 'resume' : 'pause'}</span>}
      >
        <div ref={wrapRef} className="relative h-[72vh] w-full overflow-hidden">
          <pre
            ref={preRef}
            className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.0]"
            style={{ tabSize: 1 }}
          />
        </div>
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
            spiral streams always spin · perlin field drifts and rotates · click to drop expanding rings · cursor bends the field toward you.
          </div>
        </div>
      </Tile>
    </div>
  )
}
