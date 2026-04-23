import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { DEFAULTS, SUBSTRATE, type PigmentParams } from '../modules/pigment/generate'
import { PALETTES } from '../modules/pigment/ryb'
import PigmentWorker from '../workers/pigment.worker?worker'

/* pigment drift — rivers of RYB pigment flowing across a dark substrate.
   every ribbon is a harmonic curve; particles fall off it under a
   gaussian+exponential mixture; a cached domain-warp lattice folds the
   whole field; the display pass is additive emission with an HDR-style
   tonemap so bright cores glow without clipping. */

const SUBSTRATE_CSS =
  `rgb(${Math.round(SUBSTRATE[0] * 255)},${Math.round(SUBSTRATE[1] * 255)},${Math.round(SUBSTRATE[2] * 255)})`

type View = 'params' | 'math'

type RenderResponse = {
  id: number
  width: number
  height: number
  buffer: ArrayBuffer
}

export default function Pigment() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useState<PigmentParams>({ ...DEFAULTS })
  const paramsRef = useRef(params)
  const workerRef = useRef<Worker | null>(null)
  const renderIdRef = useRef(0)
  const renderStartRef = useRef(0)
  const [rendering, setRendering] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<View>('params')

  const sizeRef = useRef({ W: 0, H: 0 })

  useEffect(() => {
    paramsRef.current = params
  }, [params])

  const requestRender = useCallback((density?: number) => {
    const canvas = canvasRef.current
    const worker = workerRef.current
    if (!canvas || !worker) return
    const { W, H } = sizeRef.current
    if (W === 0 || H === 0) return
    const nextParams: PigmentParams = density !== undefined
      ? { ...paramsRef.current, density }
      : paramsRef.current
    const id = renderIdRef.current + 1
    renderIdRef.current = id
    renderStartRef.current = performance.now()
    setRendering(true)
    worker.postMessage({ id, width: W, height: H, params: nextParams })
  }, [])

  useEffect(() => {
    const worker = new PigmentWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<RenderResponse>) => {
      const { id, width, height, buffer } = event.data
      if (id !== renderIdRef.current) return

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const image = new ImageData(new Uint8ClampedArray(buffer), width, height)
      ctx.putImageData(image, 0, 0)
      setElapsed(performance.now() - renderStartRef.current)
      setRendering(false)
    }

    worker.onerror = () => {
      setRendering(false)
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const size = () => {
      const r = wrap.getBoundingClientRect()
      // dpr=1 keeps per-pixel particle density high enough for the
      // subtractive accumulation to produce visible color. at 1.5+
      // the same particle budget spreads too thin and the image
      // washes out to bare paper.
      const W = Math.max(1, Math.floor(r.width))
      const H = Math.max(1, Math.floor(r.height))
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W
        canvas.height = H
        canvas.style.width = `${r.width}px`
        canvas.style.height = `${r.height}px`
      }
      sizeRef.current = { W, H }
    }

    let pending = false
    const ro = new ResizeObserver(() => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        size()
        requestRender()
      })
    })
    ro.observe(wrap)
    size()
    const id = setTimeout(() => requestRender(), 40)
    return () => { clearTimeout(id); ro.disconnect() }
  }, [requestRender])

  const debounceRef = useRef<number | null>(null)
  const scheduleRender = useCallback((drag: boolean) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    const delay = drag ? 16 : 60
    const density = drag ? Math.min(paramsRef.current.density, 60000) : undefined
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      requestRender(density)
    }, delay)
  }, [requestRender])

  useEffect(() => { scheduleRender(dragging) }, [params, dragging, scheduleRender])

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [])

  const regenerate = useCallback(() => {
    const buf = new Uint32Array(1)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf)
    } else {
      buf[0] = (Math.random() * 0xffffffff) >>> 0
    }
    setParams((p) => ({ ...p, seed: buf[0] }))
  }, [])

  const savePng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `pigment-${params.seed.toString(16)}.png`
    a.click()
  }, [params.seed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); regenerate(); return }
      if (e.key === 's' || e.key === 'S') { savePng(); return }
      if (e.key === 'm' || e.key === 'M') { setView((v) => v === 'math' ? 'params' : 'math'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [regenerate, savePng])

  const setP = (patch: Partial<PigmentParams>) =>
    setParams((p) => ({ ...p, ...patch }))

  const dragProps = {
    onPointerDown: () => setDragging(true),
    onPointerUp:   () => setDragging(false),
    onPointerCancel: () => setDragging(false),
    onBlur:        () => setDragging(false),
  }

  const footer = (
    <span className="flex items-center gap-2 font-mono text-[12px] text-[var(--color-dim)]">
      <span>seed {params.seed.toString(16).padStart(8, '0')}</span>
      <span className="text-[var(--color-line)]">·</span>
      <span>{PALETTES[params.palette].name}</span>
      <span className="text-[var(--color-line)]">·</span>
      <span className={rendering ? 'text-[var(--color-fg)]' : ''}>
        {rendering ? 'rendering…' : `${elapsed.toFixed(0)} ms · ${Math.round(params.density / 1000)}k pts`}
      </span>
    </span>
  )

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <Tile label="pigment drift" tag="river" accent="#38d1c8" footer={footer}>
        <div
          ref={wrapRef}
          className="relative h-[min(78vh,calc(100dvh-14rem))] w-full overflow-hidden"
          style={{ background: SUBSTRATE_CSS }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
      </Tile>

      <Tile label={view === 'params' ? 'params' : 'math'}>
        <div className="flex h-full flex-col gap-3 p-4">
          {/* view toggle */}
          <div className="flex gap-1 text-[13px] tracking-[0.06em]">
            <button
              data-interactive
              onClick={() => setView('params')}
              className={`flex-1 !px-2 !py-1 ${
                view === 'params'
                  ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
                  : 'text-[var(--color-dim)]'
              }`}
            >params</button>
            <button
              data-interactive
              onClick={() => setView('math')}
              className={`flex-1 !px-2 !py-1 ${
                view === 'math'
                  ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
                  : 'text-[var(--color-dim)]'
              }`}
            >math</button>
          </div>

          {view === 'params' ? (
            <div className="flex flex-col gap-3" {...dragProps}>
              <Slider label="core radius"    min={0.04} max={0.5}  step={0.005} value={params.coreRadius}   onChange={(v) => setP({ coreRadius: v })}   format={(v) => v.toFixed(2)} />
              <Slider label="spread radius"  min={0.02} max={0.8}  step={0.005} value={params.spreadRadius} onChange={(v) => setP({ spreadRadius: v })} format={(v) => v.toFixed(2)} />
              <Slider label="scatter"        min={0}    max={1}    step={0.01}  value={params.scatter}      onChange={(v) => setP({ scatter: v })}      format={(v) => v.toFixed(2)} />
              <Slider label="warp"           min={0}    max={400}  step={1}     value={params.warp}         onChange={(v) => setP({ warp: v })}         format={(v) => v.toFixed(0)} />
              <Slider label="grain"          min={0}    max={10}   step={0.05}  value={params.grain}        onChange={(v) => setP({ grain: v })}        format={(v) => v.toFixed(2)} />

              <div className="h-px bg-[var(--color-line)]" />

              <Slider label="ribbons"        min={1}    max={8}    step={1}     value={params.ribbons}      onChange={(v) => setP({ ribbons: v })}      format={(v) => v.toFixed(0)} />
              <Slider label="harmonics"      min={2}    max={8}    step={1}     value={params.harmonics}    onChange={(v) => setP({ harmonics: v })}    format={(v) => v.toFixed(0)} />
              <Slider label="β · 1/k^β"      min={0.5}  max={3}    step={0.05}  value={params.beta}         onChange={(v) => setP({ beta: v })}         format={(v) => v.toFixed(2)} />
              <Slider label="density"        min={20000} max={360000} step={1000} value={params.density}   onChange={(v) => setP({ density: v })}      format={(v) => `${Math.round(v / 1000)}k`} />

              <div className="h-px bg-[var(--color-line)]" />

              {/* palette chips */}
              <div>
                <div className="mb-1.5 text-[13px] tracking-[0.06em] text-[var(--color-dim)]">palette</div>
                <div className="flex flex-wrap gap-1">
                  {PALETTES.map((p, i) => {
                    const active = params.palette === i
                    return (
                      <button
                        key={p.name}
                        data-interactive
                        onClick={() => setP({ palette: i })}
                        className={`!px-2 !py-1 text-[12px] ${
                          active
                            ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
                            : 'text-[var(--color-dim)]'
                        }`}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="h-px bg-[var(--color-line)]" />

              {/* actions */}
              <div className="flex gap-2">
                <button
                  data-interactive
                  onClick={regenerate}
                  className="flex-1 !px-3 !py-1.5 text-[13px]"
                  title="new seed · space"
                >↻ regenerate</button>
                <button
                  data-interactive
                  onClick={savePng}
                  className="!px-3 !py-1.5 text-[13px]"
                  title="save png · s"
                >⇩ save</button>
              </div>

              <div className="text-[11px] leading-relaxed text-[var(--color-dim)]">
                RYB painter's primaries (not RGB) — so R+Y makes orange, Y+B makes green.
                Particles deposit color additively into an emission buffer; the
                display tonemap is <span className="font-mono">1 − exp(−A · k)</span>{' '}
                over a dark substrate — rivers glow, they don't subtract.
              </div>
            </div>
          ) : (
            <MathList params={params} />
          )}
        </div>
      </Tile>
    </div>
  )
}

/* ---------- math list — dark, mono, no cream panels ---------- */

function MathList({ params }: { params: PigmentParams }) {
  const rows = useMemo(() => [
    {
      title: 'ribbon curve',
      eq: 'Cᵢ(t) = (cxᵢ + αₓ · Σₖ k⁻ᵝ · sin(2π fₖ t + φₖ),  t + α_y · Σₖ gₖ · sin(2π hₖ t + ψₖ))',
      sub: `K = ${params.harmonics} · β = ${params.beta.toFixed(2)} · ${params.ribbons} ribbons`,
    },
    {
      title: 'tangent · normal',
      eq: 'T(t) = dC/dt,   N(t) = (−T_y, T_x) / ‖T‖',
      sub: 'normal via rotation by +π⁄2',
    },
    {
      title: 'offset mixture',
      eq: 'u  ~  0.7 · 𝓝(0, ρ²) ⊕ 0.3 · sgn · Exp(1⁄σ)',
      sub: `ρ = ${(params.coreRadius * 0.18).toFixed(3)} · σ = ${(params.spreadRadius * 0.22).toFixed(3)}`,
    },
    {
      title: 'particle position',
      eq: 'p  =  Cᵢ(t) + u · N(t) + s · T(t)',
      sub: 's ~ U(−ε, ε) · ε = scatter · 0.10 · env(t)',
    },
    {
      title: 'recursive domain warp',
      eq: "p′ = p + W · vfbm( p + 4 · vfbm(p) )",
      sub: `W = ${(params.warp / 1000).toFixed(3)} · 2 + 4 octaves`,
    },
    {
      title: 'RYB → RGB (Gossett-Chen)',
      eq: 'c(r,y,b) = Σ_{ijk∈{0,1}³} Cᵢⱼₖ · r^i(1−r)^(1−i) · y^j(1−y)^(1−j) · b^k(1−b)^(1−k)',
      sub: 'trilinear over 8-corner painter\'s-primary cube',
    },
    {
      title: 'emission accumulation',
      eq: 'A(x,y) = Σ c · mass,   pixel = substrate + (1 − exp(−A · k))',
      sub: `substrate = (${SUBSTRATE[0].toFixed(3)}, ${SUBSTRATE[1].toFixed(3)}, ${SUBSTRATE[2].toFixed(3)}) · k = 1.35`,
    },
    {
      title: 'cached domain warp',
      eq: "p′ = p + bilerp(warp-grid, p)",
      sub: '96×96 offsets precomputed once per frame · ≈ 20× cheaper than per-particle',
    },
    {
      title: 'speckle grain',
      eq: "A'(x,y) = A(x,y) + g · η(x,y) · ‖A‖",
      sub: `g = ${(Math.max(0, params.grain) * 0.006).toFixed(4)} · η = 2-octave hash · gated by local pigment`,
    },
  ], [params])

  return (
    <div className="flex flex-col gap-3.5 overflow-y-auto text-[13px]">
      {rows.map((row, i) => (
        <div key={i}>
          <div className="mb-0.5 flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums text-[var(--color-dim)]">
              {(i + 1).toString().padStart(2, '0')}
            </span>
            <span className="tracking-[0.06em] text-[var(--color-fg)]">{row.title}</span>
          </div>
          <div className="ml-[22px] font-mono text-[11px] leading-[1.5] text-[var(--color-fg)]">
            {row.eq}
          </div>
          <div className="ml-[22px] font-mono text-[10px] text-[var(--color-dim)]">
            {row.sub}
          </div>
        </div>
      ))}
    </div>
  )
}
