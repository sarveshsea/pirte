import { useEffect, useRef, useState, type ReactNode } from 'react'
import Slider from '../components/Slider'
import { rafLoop } from '../lib/rafLoop'
import {
  createBloomGpu, PIGMENTS, PAPERS, DEFAULT_PARAMS,
  type BloomGpu, type BloomParams,
} from '../modules/bloom/gpu'

/* bloom — watercolor painting surface.
   full-bleed canvas, floating pill toolbar. power is one tap away,
   never in the way. mobile-app ergonomics on desktop. */

type Brush = {
  radius: number      // uv units
  wetness: number
  density: number
  push: number        // scales mouse velocity → fluid impulse
  pigmentIdx: number
  monochrome: boolean // sumi-override
}

const DEFAULT_BRUSH: Brush = {
  radius: 0.016,
  wetness: 0.50,
  density: 1.1,
  push: 1.0,
  pigmentIdx: 1,      // ultramarine default
  monochrome: false,
}

type Sheet = null | 'brush' | 'advanced'

// preview color for a pigment at a given subtractive density (for swatches).
const pigmentCss = (absorb: readonly [number, number, number], d = 2.2) =>
  `rgb(${Math.round(255 * Math.exp(-absorb[0] * d))}, ${Math.round(255 * Math.exp(-absorb[1] * d))}, ${Math.round(255 * Math.exp(-absorb[2] * d))})`

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

  const [sheet, setSheet] = useState<Sheet>(null)

  // ----------- gpu sim + main loop -----------
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

    // rAF-debounced — gpu.resize reallocates rendertargets on every call
    let pendingResize = false
    const ro = new ResizeObserver(() => {
      if (pendingResize) return
      pendingResize = true
      requestAnimationFrame(() => {
        pendingResize = false
        const r = wrap.getBoundingClientRect()
        gpu?.resize(r.width, r.height)
      })
    })
    ro.observe(wrap)
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

  // ----------- pointer → brush -----------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const drag = { down: false, lastX: 0, lastY: 0, lastT: 0 }

    const toUv = (cx: number, cy: number) => {
      const r = wrap.getBoundingClientRect()
      return { x: (cx - r.left) / r.width, y: 1 - (cy - r.top) / r.height }
    }
    const stamp = (x: number, y: number, dx: number, dy: number, pressure = 0.5) => {
      const gpu = gpuRef.current; if (!gpu) return
      const b = brushRef.current
      const pig = PIGMENTS[b.pigmentIdx]
      const absorb: [number, number, number] = b.monochrome ? [1, 1, 1] : pig.absorb
      const k = 0.5 + pressure * 0.8
      gpu.splat({
        x, y, dx, dy,
        radius: b.radius * k,
        wetness: b.wetness * k,
        density: b.density * k,
        absorb,
      })
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      wrap.setPointerCapture(e.pointerId)
      const { x, y } = toUv(e.clientX, e.clientY)
      drag.down = true; drag.lastX = x; drag.lastY = y; drag.lastT = performance.now()
      stamp(x, y, 0, 0, e.pressure || 0.5)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.down) return
      const now = performance.now()
      const { x, y } = toUv(e.clientX, e.clientY)
      const dtMs = Math.max(1, now - drag.lastT)
      const vx = (x - drag.lastX) / dtMs * 1000
      const vy = (y - drag.lastY) / dtMs * 1000
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
          vx * b.push * 0.15, vy * b.push * 0.15,
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

  // ----------- keyboard (same bindings as before, preserved for power users) -----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') { setSheet(null); return }
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

  const currentPaper = PAPERS[paperIdx]
  // paper is dark? swap chrome contrast for readability on light paper
  const lightChrome = currentPaper.rgb[0] > 200

  return (
    <div
      className="relative h-[calc(100vh-9rem)] w-full overflow-hidden rounded-xl"
      style={{ background: `rgb(${currentPaper.rgb.join(',')})` }}
    >
      {/* canvas mount — absolute so it fills the tile */}
      <div ref={wrapRef} className="absolute inset-0" style={{ cursor: 'crosshair', touchAction: 'none' }} />

      {/* corner chips — top-right */}
      <div className="absolute right-3 top-3 z-10 flex gap-1.5">
        <Chip onClick={() => setFrozen((v) => !v)} active={frozen} title={frozen ? 'resume · space' : 'freeze · space'}>
          <span className="font-mono">{frozen ? '▸' : '▮▮'}</span>
        </Chip>
        <Chip onClick={() => gpuRef.current?.reseedPaper()} title="reseed paper · r">
          <span className="font-mono">↻</span>
        </Chip>
        <Chip
          onClick={() => setBrush((b) => ({ ...b, monochrome: !b.monochrome }))}
          active={brush.monochrome}
          title="sumi override · m"
        >
          sumi
        </Chip>
      </div>

      {/* corner chips — bottom-right */}
      <div className="absolute bottom-3 right-3 z-10 flex gap-1.5">
        <Chip onClick={() => gpuRef.current?.clear()} title="clear · c">
          <span className="font-mono">⌫</span>
        </Chip>
        <Chip onClick={savePng} title="save png · s">
          <span className="font-mono">⇩</span>
        </Chip>
      </div>

      {/* sheet — brush */}
      {sheet === 'brush' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="text-[10px] tracking-[0.2em] text-white/60 mb-2">brush</div>
          <div className="flex flex-col gap-2.5">
            <WhiteSlider label="radius"  value={brush.radius}  min={0.004} max={0.10} step={0.001} onChange={(v) => setBrush((b) => ({ ...b, radius: v }))}  fmt={(v) => v.toFixed(3)} />
            <WhiteSlider label="wetness" value={brush.wetness} min={0}     max={1.5}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, wetness: v }))} fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="density" value={brush.density} min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, density: v }))} fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="push"    value={brush.push}    min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, push: v }))}    fmt={(v) => v.toFixed(2)} />
          </div>
        </Sheet>
      )}

      {/* sheet — advanced */}
      {sheet === 'advanced' && (
        <Sheet onClose={() => setSheet(null)} tall>
          <div className="flex flex-col gap-4">
            <SheetGroup label="fluid">
              <WhiteSlider label="viscosity"    value={params.viscosity}           min={0}    max={0.3} step={0.005} onChange={(v) => setP({ viscosity: v })}           fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="vel decay"    value={params.velocityDissipation} min={0.90} max={1.0} step={0.001} onChange={(v) => setP({ velocityDissipation: v })} fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="ambient curl" value={params.ambient}             min={0}    max={0.2} step={0.005} onChange={(v) => setP({ ambient: v })}             fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="pressure it"  value={params.pressureIter}        min={5}    max={40}  step={1}     onChange={(v) => setP({ pressureIter: v })}        fmt={(v) => v.toFixed(0)} />
              <WhiteSlider label="flow speed"   value={params.timeScale}           min={0}    max={3}   step={0.05}  onChange={(v) => setP({ timeScale: v })}           fmt={(v) => v.toFixed(2)} />
            </SheetGroup>
            <SheetGroup label="paint">
              <WhiteSlider label="water decay"  value={params.waterDissipation}   min={0.98} max={1.0} step={0.0005} onChange={(v) => setP({ waterDissipation: v })}  fmt={(v) => v.toFixed(4)} />
              <WhiteSlider label="dye decay"    value={params.dyeDissipation}     min={0.98} max={1.0} step={0.0005} onChange={(v) => setP({ dyeDissipation: v })}    fmt={(v) => v.toFixed(4)} />
              <WhiteSlider label="evaporation"  value={params.evaporation}        min={0}    max={1}   step={0.01}   onChange={(v) => setP({ evaporation: v })}       fmt={(v) => v.toFixed(2)} />
              <WhiteSlider label="pig diffuse"  value={params.pigmentDiffusion}   min={0}    max={0.4} step={0.005}  onChange={(v) => setP({ pigmentDiffusion: v })}  fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="edge darken"  value={params.edgeDarken}         min={0}    max={2}   step={0.02}   onChange={(v) => setP({ edgeDarken: v })}        fmt={(v) => v.toFixed(2)} />
            </SheetGroup>
            <SheetGroup label="look">
              <WhiteSlider label="absorption"  value={params.absorption}  min={0.5} max={6} step={0.05} onChange={(v) => setP({ absorption: v })}  fmt={(v) => v.toFixed(2)} />
              <WhiteSlider label="grain"       value={params.grain}       min={0}   max={1} step={0.01} onChange={(v) => setP({ grain: v })}       fmt={(v) => v.toFixed(2)} />
              <WhiteSlider label="vignette"    value={params.vignette}    min={0}   max={1} step={0.01} onChange={(v) => setP({ vignette: v })}    fmt={(v) => v.toFixed(2)} />
            </SheetGroup>
            <button
              onClick={resetParams}
              className="self-start rounded-full bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/20"
            >reset all params</button>
          </div>
        </Sheet>
      )}

      {/* bottom-center toolbar — single pill */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1.5 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
          {/* pigments */}
          <div className="flex gap-1">
            {PIGMENTS.map((p, i) => {
              const active = brush.pigmentIdx === i && !brush.monochrome
              return (
                <button
                  key={p.label}
                  onClick={() => setBrush((b) => ({ ...b, pigmentIdx: i, monochrome: false }))}
                  title={`${p.label} · ${i + 1}`}
                  className={`h-7 w-7 rounded-full transition-all ${
                    active
                      ? 'ring-2 ring-white scale-110'
                      : 'ring-1 ring-white/25 hover:ring-white/60 hover:scale-105'
                  }`}
                  style={{ background: pigmentCss(p.absorb) }}
                />
              )
            })}
          </div>
          <Sep />
          {/* brush size button — shows a dot sized to current radius, opens sheet */}
          <button
            onClick={() => setSheet((s) => (s === 'brush' ? null : 'brush'))}
            title="brush · tap to adjust"
            className={`flex h-8 items-center gap-1.5 rounded-full px-2 transition-colors ${
              sheet === 'brush' ? 'bg-white/15' : 'hover:bg-white/10'
            }`}
          >
            <span className="grid h-6 w-6 place-items-center">
              <span
                className="rounded-full bg-white transition-all"
                style={{
                  width:  `${Math.max(3, Math.min(22, brush.radius * 220))}px`,
                  height: `${Math.max(3, Math.min(22, brush.radius * 220))}px`,
                }}
              />
            </span>
            <span className="hidden text-[11px] tabular-nums text-white/70 sm:inline">
              {(brush.radius * 1000).toFixed(0)}
            </span>
          </button>
          <Sep />
          {/* papers */}
          <div className="flex gap-1">
            {PAPERS.map((pp, i) => (
              <button
                key={pp.label}
                onClick={() => setPaperIdx(i)}
                title={pp.label}
                className={`h-7 w-7 rounded-md transition-all ${
                  paperIdx === i ? 'ring-2 ring-white scale-110' : 'ring-1 ring-white/25 hover:ring-white/60'
                }`}
                style={{ background: `rgb(${pp.rgb.join(',')})` }}
              />
            ))}
          </div>
          <Sep />
          {/* more */}
          <button
            onClick={() => setSheet((s) => (s === 'advanced' ? null : 'advanced'))}
            title="advanced"
            className={`grid h-8 w-8 place-items-center rounded-full text-[16px] text-white transition-colors ${
              sheet === 'advanced' ? 'bg-white/15' : 'hover:bg-white/10'
            }`}
          >⋯</button>
        </div>
        {/* single-line hint. fades with the toolbar when user is painting — we just keep it static, readable. */}
        <div className={`mt-2 text-center text-[10px] tracking-[0.15em] ${lightChrome ? 'text-black/40' : 'text-white/40'}`}>
          drag to paint · 1–8 pigment · [ ] brush · m mono · space freeze · c clear · s save
        </div>
      </div>
    </div>
  )
}

// ------ sub-components ------

function Chip({
  children, onClick, active, title,
}: { children: ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[11px] tracking-[0.08em] backdrop-blur-md ring-1 transition-colors ${
        active
          ? 'bg-white/85 text-black ring-white'
          : 'bg-black/60 text-white/85 ring-white/15 hover:bg-black/75 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span aria-hidden className="mx-0.5 h-6 w-px bg-white/15" />
}

function Sheet({ children, onClose, tall }: { children: ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <div
      className={`absolute bottom-20 left-1/2 z-20 w-[min(560px,92vw)] -translate-x-1/2 rounded-2xl bg-black/75 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-lg ${
        tall ? 'max-h-[70vh] overflow-y-auto' : ''
      }`}
    >
      <button
        onClick={onClose}
        aria-label="close"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
      >×</button>
      {children}
    </div>
  )
}

function SheetGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="text-[10px] tracking-[0.2em] text-white/50">{label}</div>
      {children}
    </section>
  )
}

// white-theme wrapper around the shared Slider so sheet text stays readable on dark glass.
function WhiteSlider(props: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; fmt?: (v: number) => string
}) {
  return (
    <div className="[&_input]:accent-white [&>label]:!text-white/70 [&>label>span>span:last-child]:!text-white">
      <Slider
        label={props.label}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={props.onChange}
        format={props.fmt}
      />
    </div>
  )
}
