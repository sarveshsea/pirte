import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Slider from '../components/Slider'
import { rafLoop } from '../lib/rafLoop'
import {
  createBloomGpu, PIGMENTS, PAPERS, DEFAULT_PARAMS, BRUSH_PRESETS,
  type BloomGpu, type BloomParams, type PigmentFamily, type BrushPreset,
} from '../modules/bloom/gpu'

/* bloom — watercolor painting surface.
   full-bleed canvas, floating pill toolbar. power is one tap away,
   never in the way. mobile-app ergonomics on desktop. */

type Brush = {
  radius: number          // uv units
  wetness: number
  density: number
  push: number            // scales mouse velocity → fluid impulse
  pigmentIdx: number
  monochrome: boolean     // sumi-override
  // per-stamp behaviors — sourced from the active brush preset. defaults
  // reproduce the old fixed-round-brush behavior when untouched.
  spacing: number         // relative to radius (0.55 = half-radius apart)
  jitterPos: number       // uv lateral shake per stamp
  jitterRadius: number    // fraction of radius varied per stamp (0..1)
  pressureGamma: number   // pressure → scale curve; >1 hard, <1 soft
  presetId: string
}

const DEFAULT_BRUSH: Brush = (() => {
  const p = BRUSH_PRESETS[0]
  return {
    radius: p.radius,
    wetness: p.wetness,
    density: p.density,
    push: p.push,
    pigmentIdx: 1,
    monochrome: false,
    spacing: p.spacing,
    jitterPos: p.jitterPos,
    jitterRadius: p.jitterRadius,
    pressureGamma: p.pressureGamma,
    presetId: p.id,
  }
})()

type Sheet = null | 'brush' | 'advanced' | 'palette'

// hue-family ordering for the palette sheet
const FAMILIES: { id: PigmentFamily; label: string }[] = [
  { id: 'black',  label: 'black · grey' },
  { id: 'red',    label: 'red' },
  { id: 'orange', label: 'orange' },
  { id: 'yellow', label: 'yellow' },
  { id: 'earth',  label: 'earth' },
  { id: 'green',  label: 'green' },
  { id: 'blue',   label: 'blue' },
  { id: 'violet', label: 'violet' },
]

function applyPreset(b: Brush, p: BrushPreset): Brush {
  return {
    ...b,
    radius:        p.radius,
    wetness:       p.wetness,
    density:       p.density,
    push:          p.push,
    spacing:       p.spacing,
    jitterPos:     p.jitterPos,
    jitterRadius:  p.jitterRadius,
    pressureGamma: p.pressureGamma,
    presetId:      p.id,
  }
}

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

      // pressure curve — per-brush gamma. dry / detail / sumi respond hard,
      // wash responds soft so a light tap already lays water down.
      const gamma = b.pressureGamma || 1
      const pShaped = Math.pow(Math.max(0, Math.min(1, pressure)), gamma)
      const k = 0.5 + pShaped * 0.9

      // per-stamp lateral jitter (bristle, splatter) + radius variance (dry)
      let jx = 0, jy = 0
      if (b.jitterPos > 0) {
        const ang = Math.random() * Math.PI * 2
        const mag = Math.random() * b.jitterPos
        jx = Math.cos(ang) * mag
        jy = Math.sin(ang) * mag
      }
      const rJitter = b.jitterRadius > 0
        ? 1 - b.jitterRadius * Math.random()
        : 1

      gpu.splat({
        x: x + jx,
        y: y + jy,
        dx, dy,
        radius:  b.radius  * k * rJitter,
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
      // per-brush spacing — flat is dense (0.30), splatter is sparse (1.8)
      const spacingUv = Math.max(0.0015, b.radius * (b.spacing || 0.55))
      const n = Math.max(1, Math.ceil(dist / spacingUv))
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
      className="relative h-[min(calc(100vh-9rem),calc(100dvh-14rem))] w-full overflow-hidden rounded-xl"
      style={{ background: `rgb(${currentPaper.rgb.join(',')})` }}
    >
      {/* canvas mount — absolute so it fills the tile */}
      <div ref={wrapRef} className="absolute inset-0" style={{ cursor: 'crosshair', touchAction: 'none' }} />

      {/* flow compass — top-left. shows the current river direction + speed
          and lets you drag to rotate. double-click sets speed to 0 (still water). */}
      <div className="absolute left-3 top-3 z-10">
        <FlowCompass
          angle={params.flowAngle}
          speed={params.flowSpeed}
          meander={params.flowMeander}
          dark={!lightChrome}
          onAngle={(a) => setP({ flowAngle: a })}
          onSpeed={(s) => setP({ flowSpeed: s })}
        />
      </div>

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

      {/* sheet — brush (presets + fine-tune) */}
      {sheet === 'brush' && (
        <Sheet onClose={() => setSheet(null)} tall>
          <div className="text-[10px] tracking-[0.2em] text-white/60 mb-2">brush</div>
          {/* preset row — click to load, then tune below */}
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {BRUSH_PRESETS.map((p) => {
              const active = brush.presetId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setBrush((b) => applyPreset(b, p))}
                  title={p.label}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition-colors ${
                    active ? 'bg-white/15 text-white ring-1 ring-white/50' : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <BrushPreview preset={p} active={active} />
                  <span className="tracking-[0.05em]">{p.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mb-1.5 text-[10px] tracking-[0.2em] text-white/50">fine-tune</div>
          <div className="flex flex-col gap-2">
            <WhiteSlider label="radius"   value={brush.radius}   min={0.004} max={0.10} step={0.001} onChange={(v) => setBrush((b) => ({ ...b, radius: v }))}   fmt={(v) => v.toFixed(3)} />
            <WhiteSlider label="wetness"  value={brush.wetness}  min={0}     max={1.5}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, wetness: v }))}  fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="density"  value={brush.density}  min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, density: v }))}  fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="push"     value={brush.push}     min={0}     max={3.0}  step={0.01}  onChange={(v) => setBrush((b) => ({ ...b, push: v }))}     fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="spacing"  value={brush.spacing}  min={0.2}   max={2.0}  step={0.05}  onChange={(v) => setBrush((b) => ({ ...b, spacing: v }))}  fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="jitter·pos"    value={brush.jitterPos}     min={0}   max={0.03} step={0.001} onChange={(v) => setBrush((b) => ({ ...b, jitterPos: v }))}     fmt={(v) => v.toFixed(3)} />
            <WhiteSlider label="jitter·size"   value={brush.jitterRadius}  min={0}   max={1}    step={0.02}  onChange={(v) => setBrush((b) => ({ ...b, jitterRadius: v }))}  fmt={(v) => v.toFixed(2)} />
            <WhiteSlider label="pressure γ"    value={brush.pressureGamma} min={0.4} max={2.5}  step={0.05}  onChange={(v) => setBrush((b) => ({ ...b, pressureGamma: v }))} fmt={(v) => v.toFixed(2)} />
          </div>
        </Sheet>
      )}

      {/* sheet — palette (all ~33 watercolors by hue family) */}
      {sheet === 'palette' && (
        <Sheet onClose={() => setSheet(null)} tall>
          <div className="text-[10px] tracking-[0.2em] text-white/60 mb-2">palette</div>
          <div className="flex flex-col gap-3">
            {FAMILIES.map((fam) => {
              const group = PIGMENTS
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.family === fam.id)
              if (group.length === 0) return null
              return (
                <div key={fam.id}>
                  <div className="mb-1 text-[10px] tracking-[0.2em] text-white/40">{fam.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map(({ p, i }) => {
                      const active = brush.pigmentIdx === i && !brush.monochrome
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            setBrush((b) => ({ ...b, pigmentIdx: i, monochrome: false }))
                            setSheet(null)
                          }}
                          title={p.label}
                          className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[11px] transition-colors ${
                            active
                              ? 'bg-white/15 text-white ring-1 ring-white/60'
                              : 'bg-white/5 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <span
                            className="h-5 w-5 rounded-full ring-1 ring-white/25"
                            style={{ background: pigmentCss(p.absorb) }}
                          />
                          <span className="whitespace-nowrap">{p.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Sheet>
      )}

      {/* sheet — advanced */}
      {sheet === 'advanced' && (
        <Sheet onClose={() => setSheet(null)} tall>
          <div className="flex flex-col gap-4">
            <SheetGroup label="river">
              <WhiteSlider label="current speed" value={params.flowSpeed}   min={0}      max={0.6} step={0.005} onChange={(v) => setP({ flowSpeed: v })}   fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="direction °"   value={radToDeg(params.flowAngle)} min={-180} max={180} step={1}     onChange={(v) => setP({ flowAngle: degToRad(v) })} fmt={(v) => v.toFixed(0)} />
              <WhiteSlider label="meander"       value={params.flowMeander} min={0}      max={1}   step={0.01}  onChange={(v) => setP({ flowMeander: v })} fmt={(v) => v.toFixed(2)} />
              <div className="mt-1 flex items-center gap-2">
                {(['slow', 'stream', 'fast'] as const).map((k) => {
                  const val = k === 'slow' ? 0.012 : k === 'stream' ? 0.03 : 0.08
                  return (
                    <button
                      key={k}
                      onClick={() => setP({ flowSpeed: val })}
                      className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
                    >{k}</button>
                  )
                })}
                <button
                  onClick={() => setP({ flowSpeed: 0 })}
                  className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
                >still</button>
              </div>
            </SheetGroup>
            <SheetGroup label="fluid">
              <WhiteSlider label="viscosity"    value={params.viscosity}           min={0}    max={0.3} step={0.005} onChange={(v) => setP({ viscosity: v })}           fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="vel decay"    value={params.velocityDissipation} min={0.90} max={1.0} step={0.001} onChange={(v) => setP({ velocityDissipation: v })} fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="ambient curl" value={params.ambient}             min={0}    max={0.2} step={0.005} onChange={(v) => setP({ ambient: v })}             fmt={(v) => v.toFixed(3)} />
              <WhiteSlider label="pressure it"  value={params.pressureIter}        min={5}    max={40}  step={1}     onChange={(v) => setP({ pressureIter: v })}        fmt={(v) => v.toFixed(0)} />
              <WhiteSlider label="time scale"   value={params.timeScale}           min={0}    max={3}   step={0.05}  onChange={(v) => setP({ timeScale: v })}           fmt={(v) => v.toFixed(2)} />
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
          {/* pigments — first 8 for quick access; palette button opens the full set */}
          <div className="flex gap-1">
            {PIGMENTS.slice(0, 8).map((p, i) => {
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
          {/* show current pigment swatch if it's *not* in the first-8 quick row */}
          {brush.pigmentIdx >= 8 && !brush.monochrome && (
            <span
              aria-hidden
              title={PIGMENTS[brush.pigmentIdx].label}
              className="h-7 w-7 rounded-full ring-2 ring-white scale-110"
              style={{ background: pigmentCss(PIGMENTS[brush.pigmentIdx].absorb) }}
            />
          )}
          <button
            onClick={() => setSheet((s) => (s === 'palette' ? null : 'palette'))}
            title={`palette · ${PIGMENTS.length} colors`}
            className={`flex h-7 items-center gap-1 rounded-full px-2 text-[11px] tracking-[0.05em] transition-colors ${
              sheet === 'palette' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="font-mono">◉</span>
            <span className="tabular-nums">{PIGMENTS.length}</span>
          </button>
          <Sep />
          {/* brush button — preset name + radius dot; opens brush sheet */}
          <button
            onClick={() => setSheet((s) => (s === 'brush' ? null : 'brush'))}
            title={`brush · ${brush.presetId}`}
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
            <span className="hidden text-[11px] tracking-[0.05em] text-white/80 sm:inline">{brush.presetId}</span>
            <span className="hidden text-[11px] tabular-nums text-white/50 md:inline">
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
          drag to paint · 1–8 pigment · ◉ palette · brush presets · [ ] size · m mono · space freeze · c clear · s save
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

/* a tiny stroke-preview that illustrates each brush preset's feel —
   radius drives height, jitterPos drives wobble, jitterRadius drives
   stamp variance, spacing drives stamp count, pressureGamma drives
   head/tail taper. pure svg, 96×22 px, one <circle> per stamp. */
function BrushPreview({ preset, active }: { preset: BrushPreset; active: boolean }) {
  const dots = useMemo(() => {
    const W = 96, H = 22
    const cy = H / 2
    const rBase = Math.min(8, Math.max(2, preset.radius * 120))
    const stepPx = Math.max(3, rBase * 1.3 * (preset.spacing || 0.55))
    const count = Math.max(4, Math.floor((W - 10) / stepPx))
    // deterministic pseudo-random so preview is stable per preset
    let seed = (preset.id.charCodeAt(0) * 131) | 0
    const rnd = () => {
      seed = (Math.imul(seed ^ (seed >>> 13), 1274126177) ^ 0x9e3779b9) | 0
      return ((seed >>> 0) % 10000) / 10000
    }
    const jitterPx = preset.jitterPos * 400          // uv → preview px
    const rJit = preset.jitterRadius
    const gamma = preset.pressureGamma
    const out: Array<{ cx: number; cy: number; r: number; op: number }> = []
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      // taper via pressure gamma — tails dim when gamma > 1
      const pressure = Math.pow(0.4 + 0.6 * Math.sin(t * Math.PI), gamma)
      const dy = (rnd() - 0.5) * 2 * jitterPx
      const rV = rBase * (1 - (rJit * rnd())) * (0.5 + 0.7 * pressure)
      out.push({
        cx: 5 + t * (W - 10),
        cy: cy + dy,
        r: Math.max(0.7, rV),
        op: 0.55 + 0.35 * pressure,
      })
    }
    return { W, H, out }
  }, [preset])
  return (
    <svg
      width={dots.W}
      height={dots.H}
      viewBox={`0 0 ${dots.W} ${dots.H}`}
      aria-hidden
      style={{ opacity: active ? 1 : 0.85 }}
    >
      {dots.out.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="white" fillOpacity={d.op} />
      ))}
    </svg>
  )
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

// ── river flow ────────────────────────────────────────────────────────
const radToDeg = (r: number) => (r * 180) / Math.PI
const degToRad = (d: number) => (d * Math.PI) / 180

/* the flow compass — a 56×56 glass disk in the corner that visualizes the
   current river direction + speed. drag anywhere on it to rotate. click
   the center to toggle still/flowing. shift-drag from the edge sets speed
   by how far you drag from center. designed to be the primary handle for
   "which way is the water going" without opening the advanced sheet. */
function FlowCompass({
  angle, speed, meander, dark, onAngle, onSpeed,
}: {
  angle: number
  speed: number
  meander: number
  dark: boolean
  onAngle: (a: number) => void
  onSpeed: (s: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const SPEED_MAX = 0.3  // compass can dial up to here; sheet goes higher
  const size = 58
  const cx = size / 2
  const cy = size / 2

  const arrowLen = 12 + Math.min(16, (speed / SPEED_MAX) * 16)
  // screen angle — positive y is *up* in our convention; SVG y grows down,
  // so flip sin for the screen vector used to draw the arrow.
  const ax = Math.cos(angle) * arrowLen
  const ay = -Math.sin(angle) * arrowLen

  const pointToAngle = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return { ang: angle, mag: 0 }
    const r = el.getBoundingClientRect()
    const px = clientX - (r.left + r.width / 2)
    const py = clientY - (r.top + r.height / 2)
    // svg y grows down; flip so up is +
    const ang = Math.atan2(-py, px)
    const mag = Math.hypot(px, py) / (r.width / 2)
    return { ang, mag }
  }

  // drag handler — updates angle continuously; speed auto-adjusts when
  // user drags from the rim (mag > 0.7).
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = ref.current; if (!el) return
    el.setPointerCapture(e.pointerId)
    const first = pointToAngle(e.clientX, e.clientY)
    // clicking the center → toggle between still and the last nonzero speed
    if (first.mag < 0.25) {
      onSpeed(speed > 0 ? 0 : 0.04)
      return
    }
    onAngle(first.ang)
    if (first.mag > 0.6 || speed === 0) {
      onSpeed(Math.min(SPEED_MAX, first.mag * 0.12))
    }
    const onMove = (ev: PointerEvent) => {
      const { ang, mag } = pointToAngle(ev.clientX, ev.clientY)
      onAngle(ang)
      if (ev.shiftKey || mag > 0.85) {
        onSpeed(Math.min(SPEED_MAX, mag * 0.18))
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const ringColor = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'
  const fgColor   = dark ? 'rgba(255,255,255,0.90)' : 'rgba(0,0,0,0.80)'
  const muted     = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'

  // meander preview — a short curving tail behind the arrow whose wiggle
  // amplitude tracks uFlowMeander (0 = straight line, 1 = obvious s-curve).
  // drawn in screen-y-down SVG space; we negate y when computing.
  const tail = (() => {
    const pts: string[] = []
    const N = 10
    const dirX = Math.cos(angle), dirY = -Math.sin(angle)
    const perpX = -dirY, perpY = dirX
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const bx = cx - dirX * 18 * t
      const by = cy - dirY * 18 * t
      const wobble = Math.sin(t * Math.PI * 1.8) * meander * 4 * t
      pts.push(`${(bx + perpX * wobble).toFixed(1)},${(by + perpY * wobble).toFixed(1)}`)
    }
    return pts.join(' ')
  })()

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="river flow direction"
      aria-valuenow={Math.round(radToDeg(angle))}
      title={`flow · ${Math.round(radToDeg(angle))}° · ${speed.toFixed(3)} — drag to rotate, center to toggle, shift-drag to set speed`}
      className="grid cursor-grab place-items-center rounded-full ring-1 backdrop-blur-md active:cursor-grabbing"
      style={{
        width: size, height: size,
        background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.70)',
        borderColor: ringColor, touchAction: 'none',
        boxShadow: dark ? '0 6px 18px rgba(0,0,0,0.35)' : '0 4px 10px rgba(0,0,0,0.15)',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {/* compass rose ticks */}
        {[0, 90, 180, 270].map((deg) => {
          const r1 = size / 2 - 5
          const r2 = size / 2 - 2
          const a = degToRad(deg)
          return (
            <line
              key={deg}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke={muted}
              strokeWidth={1}
            />
          )
        })}
        {/* meander tail */}
        {speed > 0 && (
          <polyline
            points={tail}
            fill="none"
            stroke={muted}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        )}
        {/* arrow — pointing in flow direction */}
        {speed > 0 ? (
          <>
            <line
              x1={cx} y1={cy}
              x2={cx + ax} y2={cy + ay}
              stroke={fgColor}
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* arrow head */}
            <polygon
              points={(() => {
                const hx = cx + ax, hy = cy + ay
                const bx = cx + Math.cos(angle + Math.PI - 0.4) * 5
                const by = cy - Math.sin(angle + Math.PI - 0.4) * 5
                const cxa = cx + Math.cos(angle + Math.PI + 0.4) * 5
                const cya = cy - Math.sin(angle + Math.PI + 0.4) * 5
                return `${hx},${hy} ${hx + bx - cx},${hy + by - cy} ${hx + cxa - cx},${hy + cya - cy}`
              })()}
              fill={fgColor}
            />
          </>
        ) : (
          // still water — show a tiny ring instead of an arrow
          <circle cx={cx} cy={cy} r={3} fill="none" stroke={muted} strokeWidth={1.5} />
        )}
      </svg>
    </div>
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
