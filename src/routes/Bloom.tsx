import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { rafLoop } from '../lib/rafLoop'
import {
  createBloomGpu, PIGMENTS, PAPERS, DEFAULT_PARAMS,
  type BloomGpu, type BloomParams,
} from '../modules/bloom/gpu'

/* bloom — gpu watercolor. stam stable fluids + curtis capillary edge darken.
   drag to paint. ambient curl keeps the field alive between strokes. */

type Brush = {
  radius: number       // in uv units (0..0.2 useful range)
  wetness: number
  density: number
  push: number         // scales mouse velocity → impulse
  pigmentIdx: number
  monochrome: boolean
}

const DEFAULT_BRUSH: Brush = {
  radius: 0.014,
  wetness: 0.45,
  density: 1.0,
  push: 1.0,
  pigmentIdx: 1,       // ultramarine
  monochrome: false,
}

const pigmentPreviewCss = (absorb: [number, number, number], density = 2.2): string => {
  const r = Math.round(255 * Math.exp(-absorb[0] * density))
  const g = Math.round(255 * Math.exp(-absorb[1] * density))
  const b = Math.round(255 * Math.exp(-absorb[2] * density))
  return `rgb(${r}, ${g}, ${b})`
}

export default function Bloom() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const gpuRef = useRef<BloomGpu | null>(null)

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

  // -------- setup gpu sim + main loop --------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let gpu: BloomGpu | null = null
    try {
      gpu = createBloomGpu(wrap)
      gpuRef.current = gpu
    } catch (e) {
      console.error('bloom: gpu init failed', e)
      return
    }

    const ro = new ResizeObserver(() => {
      if (!gpu || !wrap) return
      const r = wrap.getBoundingClientRect()
      gpu.resize(r.width, r.height)
    })
    ro.observe(wrap)
    // initial size sync
    const r0 = wrap.getBoundingClientRect()
    gpu.resize(r0.width, r0.height)

    const cancel = rafLoop((_t, dt) => {
      if (!gpu) return
      if (!frozenRef.current) gpu.step(dt, paramsRef.current)
      gpu.render(PAPERS[paperIdxRef.current].rgb, paramsRef.current)
    })

    return () => {
      cancel()
      ro.disconnect()
      gpu?.destroy()
      gpuRef.current = null
    }
  }, [])

  // -------- pointer → brush --------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const drag = { down: false, lastX: 0, lastY: 0, lastT: 0 }

    const toUv = (cx: number, cy: number) => {
      const r = wrap.getBoundingClientRect()
      return {
        x: (cx - r.left) / r.width,
        y: 1 - (cy - r.top) / r.height,  // webgl uv has y-up
      }
    }

    const stamp = (x: number, y: number, dx: number, dy: number, pressure = 1) => {
      const gpu = gpuRef.current
      if (!gpu) return
      const b = brushRef.current
      const pig = PIGMENTS[b.pigmentIdx]
      const absorb: [number, number, number] = b.monochrome ? [1, 1, 1] : pig.absorb
      const pressureScale = 0.5 + pressure * 0.8   // range 0.5..1.3 approx
      gpu.splat({
        x, y, dx, dy,
        radius: b.radius * pressureScale,
        wetness: b.wetness * pressureScale,
        density: b.density * pressureScale,
        absorb,
      })
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      wrap.setPointerCapture(e.pointerId)
      const { x, y } = toUv(e.clientX, e.clientY)
      drag.down = true
      drag.lastX = x; drag.lastY = y
      drag.lastT = performance.now()
      stamp(x, y, 0, 0, e.pressure || 0.5)
    }

    const onMove = (e: PointerEvent) => {
      if (!drag.down) return
      const now = performance.now()
      const { x, y } = toUv(e.clientX, e.clientY)
      const dtMs = Math.max(1, now - drag.lastT)
      // velocity in uv units per second → scaled for sim
      const vx = (x - drag.lastX) / dtMs * 1000
      const vy = (y - drag.lastY) / dtMs * 1000
      // interpolate between samples so fast swipes fill
      const dist = Math.hypot(x - drag.lastX, y - drag.lastY)
      const b = brushRef.current
      const spacing = Math.max(0.003, b.radius * 0.55)
      const n = Math.max(1, Math.ceil(dist / spacing))
      const pressure = e.pressure || 0.5
      for (let k = 1; k <= n; k++) {
        const t = k / n
        stamp(
          drag.lastX + (x - drag.lastX) * t,
          drag.lastY + (y - drag.lastY) * t,
          vx * b.push * 0.15,
          vy * b.push * 0.15,
          pressure,
        )
      }
      drag.lastX = x; drag.lastY = y; drag.lastT = now
    }

    const onUp = (e: PointerEvent) => {
      drag.down = false
      try { wrap.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)
    wrap.addEventListener('pointercancel', onUp)
    return () => {
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // -------- keyboard --------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setFrozen((v) => !v); return }
      if (e.key === 'c' || e.key === 'C') { gpuRef.current?.clear(); return }
      if (e.key === 'r' || e.key === 'R') { gpuRef.current?.reseedPaper(); return }
      if (e.key === 's' || e.key === 'S') { savePng(); return }
      if (e.key === 'm' || e.key === 'M') { setBrush((b) => ({ ...b, monochrome: !b.monochrome })); return }
      if (e.key === '[') { setBrush((b) => ({ ...b, radius: Math.max(0.004, b.radius - 0.003) })); return }
      if (e.key === ']') { setBrush((b) => ({ ...b, radius: Math.min(0.10, b.radius + 0.003) })); return }
      const n = parseInt(e.key, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= PIGMENTS.length) {
        setBrush((b) => ({ ...b, pigmentIdx: n - 1, monochrome: false }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const savePng = () => {
    const gpu = gpuRef.current
    if (!gpu) return
    // render one fresh frame with preserveDrawingBuffer, then export
    gpu.render(PAPERS[paperIdxRef.current].rgb, paramsRef.current)
    const a = document.createElement('a')
    a.href = gpu.canvas.toDataURL('image/png')
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
      <Tile
        label={`bloom · ${brush.monochrome ? 'sumi' : currentPigment.label} · ${currentPaper.label}`}
        code="22"
        footer={
          <div className="flex items-center justify-between gap-4">
            <span>
              {frozen ? '▮ frozen' : '▸ flowing'} · r {brush.radius.toFixed(3)} · wet {brush.wetness.toFixed(2)}
            </span>
            <span>
              drag · space freeze · c clear · r paper · s save · m mono · [ ] · 1–8
            </span>
          </div>
        }
      >
        <div
          ref={wrapRef}
          className="relative h-[78vh] w-full overflow-hidden"
          style={{ background: `rgb(${currentPaper.rgb.join(',')})`, cursor: 'crosshair', touchAction: 'none' }}
        />
      </Tile>

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
                    style={{ background: pigmentPreviewCss(p.absorb), color: 'rgba(255,255,255,0.9)' }}
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
            <Slider label="radius"   value={brush.radius}  min={0.004} max={0.10} step={0.001} onChange={(v) => setBrush((b) => ({ ...b, radius: v }))} format={(v) => v.toFixed(3)} />
            <Slider label="wetness"  value={brush.wetness} min={0}     max={1.5}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, wetness: v }))} format={(v) => v.toFixed(2)} />
            <Slider label="density"  value={brush.density} min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, density: v }))} format={(v) => v.toFixed(2)} />
            <Slider label="push"     value={brush.push}    min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, push: v }))} format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="fluid" footer={<span>stable fluids · 20 jacobi iter</span>}>
          <div className="flex flex-col gap-3 p-4">
            <Slider label="viscosity"    value={params.viscosity}           min={0}    max={0.3} step={0.005} onChange={(v) => setP({ viscosity: v })}           format={(v) => v.toFixed(3)} />
            <Slider label="vel decay"    value={params.velocityDissipation} min={0.90} max={1.0} step={0.001} onChange={(v) => setP({ velocityDissipation: v })} format={(v) => v.toFixed(3)} />
            <Slider label="ambient curl" value={params.ambient}             min={0}    max={0.2} step={0.005} onChange={(v) => setP({ ambient: v })}             format={(v) => v.toFixed(3)} />
            <Slider label="pressure it"  value={params.pressureIter}        min={5}    max={40}  step={1}     onChange={(v) => setP({ pressureIter: v })}        format={(v) => v.toFixed(0)} />
            <Slider label="flow speed"   value={params.timeScale}           min={0}    max={3}   step={0.05}  onChange={(v) => setP({ timeScale: v })}           format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="paint" footer={<span>how the paper drinks</span>}>
          <div className="flex flex-col gap-3 p-4">
            <Slider label="water decay"  value={params.waterDissipation}   min={0.98} max={1.0} step={0.0005} onChange={(v) => setP({ waterDissipation: v })}  format={(v) => v.toFixed(4)} />
            <Slider label="dye decay"    value={params.dyeDissipation}     min={0.98} max={1.0} step={0.0005} onChange={(v) => setP({ dyeDissipation: v })}    format={(v) => v.toFixed(4)} />
            <Slider label="evaporation"  value={params.evaporation}        min={0}    max={1}   step={0.01}   onChange={(v) => setP({ evaporation: v })}       format={(v) => v.toFixed(2)} />
            <Slider label="pig diffuse"  value={params.pigmentDiffusion}   min={0}    max={0.4} step={0.005}  onChange={(v) => setP({ pigmentDiffusion: v })}  format={(v) => v.toFixed(3)} />
            <Slider label="edge darken"  value={params.edgeDarken}         min={0}    max={2}   step={0.02}   onChange={(v) => setP({ edgeDarken: v })}        format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="look">
          <div className="flex flex-col gap-3 p-4">
            <Slider label="absorption"  value={params.absorption}  min={0.5} max={6} step={0.05} onChange={(v) => setP({ absorption: v })}  format={(v) => v.toFixed(2)} />
            <Slider label="grain"       value={params.grain}       min={0}   max={1} step={0.01} onChange={(v) => setP({ grain: v })}       format={(v) => v.toFixed(2)} />
            <Slider label="vignette"    value={params.vignette}    min={0}   max={1} step={0.01} onChange={(v) => setP({ vignette: v })}    format={(v) => v.toFixed(2)} />
          </div>
        </Tile>

        <Tile label="actions">
          <div className="flex flex-wrap gap-2 p-4 text-[12px]">
            <button data-interactive onClick={() => gpuRef.current?.clear()} className="!px-3 !py-1">clear</button>
            <button data-interactive onClick={() => setFrozen((v) => !v)} className="!px-3 !py-1">{frozen ? 'unfreeze' : 'freeze'}</button>
            <button data-interactive onClick={() => gpuRef.current?.reseedPaper()} className="!px-3 !py-1">reseed paper</button>
            <button data-interactive onClick={savePng} className="!px-3 !py-1">save png</button>
            <button data-interactive onClick={resetParams} className="!px-3 !py-1">reset params</button>
          </div>
        </Tile>

        <Tile label="about" footer={<span>stam 1999 · curtis 1997</span>}>
          <div className="flex flex-col gap-2 p-4 text-[12px] text-[var(--color-dim)]">
            <p className="text-[var(--color-fg)]">drag to paint. let it dry. watch the edges darken.</p>
            <p>gpu stable-fluids (advect → diffuse → divergence → pressure → gradient). watercolor layer adds capillary flow = −∇water, which physically drags pigment toward drying boundaries — the cauliflower edge real watercolor makes.</p>
            <p>ambient curl-of-noise keeps the field breathing between strokes. subtractive beer-lambert render, with a per-cell paper-grain granulation bias.</p>
          </div>
        </Tile>
      </div>
    </div>
  )
}
