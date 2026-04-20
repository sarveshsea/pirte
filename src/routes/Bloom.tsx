import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { rafLoop } from '../lib/rafLoop'
import { prefersReducedMotion } from '../lib/canvas'
import {
  createBloomSim, PIGMENTS, PAPERS, DEFAULT_PARAMS, pigmentPreviewCss,
  type BloomParams,
} from '../modules/bloom/sim'

/* bloom — wet-on-wet watercolor toy. drag to paint, diffuse, let it dry. */

// simulation grid. 256×160 ≈ 41k cells — runs comfortably at 60fps with a
// hand-rolled advection/diffusion step. display is upscaled with bilinear
// smoothing so the soft ramps read as pigment, not pixels.
const SIM_COLS = 256
const SIM_ROWS = 160

type Brush = {
  radius: number
  wetness: number
  density: number
  push: number          // how strongly mouse velocity kicks the fluid
  pigmentIdx: number
  monochrome: boolean   // override current pigment with sumi ink
}

const DEFAULT_BRUSH: Brush = {
  radius: 7,
  wetness: 0.45,
  density: 0.85,
  push: 0.6,
  pigmentIdx: 1,    // ultramarine — nicer default than black
  monochrome: false,
}

export default function Bloom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // one sim instance for the lifetime of the route
  const sim = useMemo(() => createBloomSim(SIM_COLS, SIM_ROWS, 42), [])

  // params and brush are duplicated as ref + state so the raf loop reads the
  // latest values without re-subscribing every slider change
  const paramsRef = useRef<BloomParams>({ ...DEFAULT_PARAMS })
  const [params, setParams] = useState<BloomParams>(paramsRef.current)
  const setP = (patch: Partial<BloomParams>) => {
    paramsRef.current = { ...paramsRef.current, ...patch }
    setParams(paramsRef.current)
  }

  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH)
  const brushRef = useRef(brush); brushRef.current = brush

  const [paperIdx, setPaperIdx] = useState(0)
  const paperIdxRef = useRef(paperIdx); paperIdxRef.current = paperIdx

  const [frozen, setFrozen] = useState(false)
  const frozenRef = useRef(frozen); frozenRef.current = frozen

  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const imageDataRef = useRef<ImageData | null>(null)

  // init offscreen at sim resolution (we draw imageData here, then upscale)
  useEffect(() => {
    const off = document.createElement('canvas')
    off.width = SIM_COLS
    off.height = SIM_ROWS
    offscreenRef.current = off
    const octx = off.getContext('2d')
    if (octx) imageDataRef.current = octx.createImageData(SIM_COLS, SIM_ROWS)
  }, [])

  // main render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = prefersReducedMotion()

    // keep the display canvas DPR-aware without a per-frame measure
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }
    resize()
    const wrap = wrapRef.current
    const ro = wrap ? new ResizeObserver(resize) : null
    if (ro && wrap) ro.observe(wrap)

    const cancel = rafLoop((_t, dt) => {
      const off = offscreenRef.current
      const img = imageDataRef.current
      if (!off || !img) return
      if (!frozenRef.current && !reduce) sim.step(dt, paramsRef.current)
      sim.render(img, PAPERS[paperIdxRef.current].rgb, paramsRef.current)
      const octx = off.getContext('2d')
      if (!octx) return
      octx.putImageData(img, 0, 0)
      const rect = canvas.getBoundingClientRect()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.drawImage(off, 0, 0, rect.width, rect.height)
    })
    return () => { ro?.disconnect(); cancel() }
  }, [sim])

  // pointer → brush strokes
  const drawRef = useRef({ down: false, lastX: 0, lastY: 0, lastT: 0 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const toSim = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect()
      const nx = (cx - rect.left) / rect.width
      const ny = (cy - rect.top) / rect.height
      return { x: nx * SIM_COLS, y: ny * SIM_ROWS }
    }

    const stamp = (x: number, y: number, dx: number, dy: number) => {
      const b = brushRef.current
      const pig = PIGMENTS[b.pigmentIdx]
      const absorb: [number, number, number] = b.monochrome
        ? [1, 1, 1]
        : pig.absorb
      sim.stamp({ x, y, dx, dy, radius: b.radius, wetness: b.wetness, density: b.density, absorb })
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const { x, y } = toSim(e.clientX, e.clientY)
      drawRef.current = { down: true, lastX: x, lastY: y, lastT: performance.now() }
      stamp(x, y, 0, 0)
    }
    const onMove = (e: PointerEvent) => {
      if (!drawRef.current.down) return
      const now = performance.now()
      const { x, y } = toSim(e.clientX, e.clientY)
      const { lastX, lastY, lastT } = drawRef.current
      const dtMs = Math.max(1, now - lastT)
      const mvx = ((x - lastX) / dtMs) * 1000  // cells/sec
      const mvy = ((y - lastY) / dtMs) * 1000
      // interpolate between samples so fast swipes fill in
      const dist = Math.hypot(x - lastX, y - lastY)
      const b = brushRef.current
      const spacing = Math.max(1, b.radius * 0.4)
      const n = Math.max(1, Math.ceil(dist / spacing))
      for (let k = 1; k <= n; k++) {
        const t = k / n
        stamp(
          lastX + (x - lastX) * t,
          lastY + (y - lastY) * t,
          mvx * b.push * 0.12,
          mvy * b.push * 0.12,
        )
      }
      drawRef.current.lastX = x
      drawRef.current.lastY = y
      drawRef.current.lastT = now
    }
    const onUp = (e: PointerEvent) => {
      drawRef.current.down = false
      canvas.releasePointerCapture(e.pointerId)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [sim])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setFrozen((v) => !v); return }
      if (e.key === 'c' || e.key === 'C') { sim.clear(); return }
      if (e.key === 'r' || e.key === 'R') { sim.reseedPaper(); return }
      if (e.key === 's' || e.key === 'S') { savePng(); return }
      if (e.key === 'm' || e.key === 'M') { setBrush((b) => ({ ...b, monochrome: !b.monochrome })); return }
      if (e.key === '[') { setBrush((b) => ({ ...b, radius: Math.max(2, b.radius - 2) })); return }
      if (e.key === ']') { setBrush((b) => ({ ...b, radius: Math.min(40, b.radius + 2) })); return }
      const n = parseInt(e.key, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= PIGMENTS.length) {
        setBrush((b) => ({ ...b, pigmentIdx: n - 1 }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const savePng = () => {
    const off = offscreenRef.current
    if (!off) return
    // export at 3× for a crisp save
    const exp = document.createElement('canvas')
    exp.width = SIM_COLS * 3
    exp.height = SIM_ROWS * 3
    const ectx = exp.getContext('2d')
    if (!ectx) return
    ectx.imageSmoothingEnabled = true
    ectx.imageSmoothingQuality = 'high'
    ectx.drawImage(off, 0, 0, exp.width, exp.height)
    const a = document.createElement('a')
    a.href = exp.toDataURL('image/png')
    a.download = `bloom-${Date.now()}.png`
    a.click()
  }

  const resetParams = () => {
    paramsRef.current = { ...DEFAULT_PARAMS }
    setParams(paramsRef.current)
  }

  const currentPigment = PIGMENTS[brush.pigmentIdx]
  const currentPaper = PAPERS[paperIdx]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      {/* canvas */}
      <Tile
        label={`bloom · ${brush.monochrome ? 'sumi' : currentPigment.label} · ${currentPaper.label}`}
        code="21"
        footer={
          <div className="flex items-center justify-between gap-4">
            <span>
              {frozen ? '▮ frozen' : '▸ flowing'} · r {brush.radius} · wet {brush.wetness.toFixed(2)}
            </span>
            <span>
              drag to paint · space freeze · c clear · r paper · s save · m mono · [ ] · 1–8
            </span>
          </div>
        }
      >
        <div
          ref={wrapRef}
          className="relative h-[72vh] w-full overflow-hidden"
          style={{ background: `rgb(${currentPaper.rgb.join(',')})` }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            style={{ cursor: 'crosshair' }}
          />
        </div>
      </Tile>

      {/* right sidebar */}
      <div className="flex flex-col gap-6">
        <Tile label="palette" code={String(brush.pigmentIdx + 1).padStart(2, '0')} footer={<span>press 1–8</span>}>
          <div className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-4 gap-2">
              {PIGMENTS.map((p, i) => {
                const active = i === brush.pigmentIdx && !brush.monochrome
                return (
                  <button
                    key={p.label}
                    data-interactive
                    onClick={() => setBrush((b) => ({ ...b, pigmentIdx: i, monochrome: false }))}
                    title={p.label}
                    className={`flex h-14 items-end justify-start !border !px-1.5 !py-1 text-[10px] transition-colors ${
                      active ? '!border-[var(--color-fg)]' : '!border-[var(--color-line)]'
                    }`}
                    style={{ background: pigmentPreviewCss(p, 2.2), color: 'rgba(255,255,255,0.9)' }}
                  >
                    <span className="tracking-[0.08em] mix-blend-difference">{p.label}</span>
                  </button>
                )
              })}
            </div>
            <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-dim)]">
              <span>monochrome (sumi override)</span>
              <input
                type="checkbox"
                checked={brush.monochrome}
                onChange={(e) => setBrush((b) => ({ ...b, monochrome: e.target.checked }))}
              />
            </label>
          </div>
        </Tile>

        <Tile label="paper" footer={<span>substrate tint</span>}>
          <div className="grid grid-cols-4 gap-2 p-4">
            {PAPERS.map((pp, i) => (
              <button
                key={pp.label}
                data-interactive
                onClick={() => setPaperIdx(i)}
                className={`flex h-10 items-center justify-center !border text-[10px] ${
                  paperIdx === i ? '!border-[var(--color-fg)]' : '!border-[var(--color-line)]'
                }`}
                style={{
                  background: `rgb(${pp.rgb.join(',')})`,
                  color: pp.rgb[0] < 100 ? '#ddd' : '#111',
                }}
              >
                {pp.label}
              </button>
            ))}
          </div>
        </Tile>

        <Tile label="brush">
          <div className="flex flex-col gap-3 p-4">
            <Slider label="radius"   value={brush.radius}  min={2} max={40} step={1}    onChange={(v) => setBrush((b) => ({ ...b, radius: v }))} />
            <Slider label="wetness"  value={brush.wetness} min={0} max={1}  step={0.01} onChange={(v) => setBrush((b) => ({ ...b, wetness: v }))} format={(v) => v.toFixed(2)} />
            <Slider label="density"  value={brush.density} min={0} max={2}  step={0.01} onChange={(v) => setBrush((b) => ({ ...b, density: v }))} format={(v) => v.toFixed(2)} />
            <Slider label="push"     value={brush.push}    min={0} max={2}  step={0.01} onChange={(v) => setBrush((b) => ({ ...b, push: v }))} format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="flow" footer={<span>how the paper drinks</span>}>
          <div className="flex flex-col gap-3 p-4">
            <Slider label="diffusion"   value={params.diffusion}   min={0}   max={1} step={0.01} onChange={(v) => setP({ diffusion: v })}   format={(v) => v.toFixed(2)} />
            <Slider label="viscosity"   value={params.viscosity}   min={0}   max={1} step={0.01} onChange={(v) => setP({ viscosity: v })}   format={(v) => v.toFixed(2)} />
            <Slider label="evaporation" value={params.evaporation} min={0}   max={1} step={0.01} onChange={(v) => setP({ evaporation: v })} format={(v) => v.toFixed(2)} />
            <Slider label="edge darken" value={params.edgeDarken}  min={0}   max={2} step={0.01} onChange={(v) => setP({ edgeDarken: v })}  format={(v) => v.toFixed(2)} />
            <Slider label="absorption"  value={params.absorption}  min={0.5} max={6} step={0.05} onChange={(v) => setP({ absorption: v })}  format={(v) => v.toFixed(2)} />
            <Slider label="grain"       value={params.grain}       min={0}   max={1} step={0.01} onChange={(v) => setP({ grain: v })}       format={(v) => v.toFixed(2)} />
            <Slider label="flow speed"  value={params.flow}        min={0}   max={3} step={0.05} onChange={(v) => setP({ flow: v })}        format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="actions">
          <div className="flex flex-wrap gap-2 p-4 text-[12px]">
            <button data-interactive onClick={() => sim.clear()} className="!px-3 !py-1">clear</button>
            <button data-interactive onClick={() => setFrozen((v) => !v)} className="!px-3 !py-1">{frozen ? 'unfreeze' : 'freeze'}</button>
            <button data-interactive onClick={() => sim.reseedPaper()} className="!px-3 !py-1">reseed paper</button>
            <button data-interactive onClick={savePng} className="!px-3 !py-1">save png</button>
            <button data-interactive onClick={resetParams} className="!px-3 !py-1">reset flow</button>
          </div>
        </Tile>

        <Tile label="about" footer={<span>subtractive beer-lambert rendering</span>}>
          <div className="flex flex-col gap-2 p-4 text-[12px] text-[var(--color-dim)]">
            <p className="text-[var(--color-fg)]">drag to paint. let it dry. watch the edges darken.</p>
            <p>capillary action pulls pigment toward drying boundaries — the "cauliflower edge" real watercolor makes.</p>
            <p>sumi mode locks brush to india ink for brush-and-ink wash studies.</p>
          </div>
        </Tile>
      </div>
    </div>
  )
}
