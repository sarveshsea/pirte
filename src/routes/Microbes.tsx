import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { SIMS, type SimInstance, type SimLayer } from '../modules/microbes/index'
import { createSparkBuf, type SparkBuf } from '../modules/microbes/sparkline'
import { prefersReducedMotion } from '../lib/canvas'
import { rafLoop } from '../lib/rafLoop'
import {
  computeDishRadius,
  renderDishChrome,
  renderVolumetricLayer,
  type SceneView,
} from '../modules/microbes/petri'
import { PhaseTrail, renderPhase } from '../modules/microbes/phasePortrait'

/*
 * microbes — 8 biology + chemistry simulations rendered as ascii data-art
 * inside a real 3d petri dish. each sim cell is projected through an
 * azimuth + elevation camera; dense glyphs pop up out of the dish floor.
 *
 * dish chrome (rim top/side/bot, meniscus top/bot, floor dots) is resampled
 * every frame from a world-space circle — rotates with the view.
 *
 * drag on the dish rotates: horizontal = azimuth, vertical = elevation
 * (clamped). release with momentum; auto-drift when idle.
 *
 * a live phase-portrait tile traces the (x,y) trajectory returned by
 * sim.phase(): predator/prey orbits, SIR curve, oregonator coupling, etc.
 */

const NUM_LAYERS = 3              // max render layers we ever composite
const PHASE_TRAIL_SIZE = 240
const PHASE_COLS = 38
const PHASE_ROWS = 14
const CHAR_ASPECT = 0.55
const DISH_CLIP = 'ellipse(var(--dish-ax, 48%) var(--dish-ay, 25%) at 50% 50%)'

// elevation clamp (radians). 0 = top-down, π/2 = side view.
const EL_MIN = 0.5
const EL_MAX = 1.35
const EL_DEFAULT = 1.0
const AZ_DEFAULT = 0.35
const AUTO_DRIFT_RATE = 0.08      // rad/sec when idle

const METRIC_FMT = (k: string, v: number): string => {
  if (Number.isNaN(v)) return '—'
  if (/agents|period|peak|τ|R_0/.test(k)) return v >= 100 ? v.toFixed(0) : v.toFixed(2)
  if (v >= 0 && v <= 1 && !/mean|Du|Dv|ε|α|β|potential|ratio/.test(k)) return (v * 100).toFixed(1) + '%'
  return Math.abs(v) < 0.01 ? v.toExponential(2) : v.toFixed(3)
}

type ViewState = {
  azimuth: number
  elevation: number
  vAz: number          // azimuth velocity (rad/s)
  vEl: number          // elevation velocity (rad/s)
}

type DragState = {
  startX: number
  startY: number
  startAz: number
  startEl: number
  lastX: number
  lastY: number
  lastT: number
  vAz: number          // ema velocity, in rad/s
  vEl: number
}

export default function Microbes() {
  const [simIdx, setSimIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [gridSize, setGridSize] = useState({ cols: 0, rows: 0 })
  const [subIdx, setSubIdx] = useState(0)

  const spec = SIMS[simIdx]
  const simRef = useRef<SimInstance | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // dish layers
  const rimTopRef = useRef<HTMLPreElement>(null)
  const rimSideRef = useRef<HTMLPreElement>(null)
  const rimBotRef = useRef<HTMLPreElement>(null)
  const rimAnchorsRef = useRef<HTMLPreElement>(null)
  const menTopRef = useRef<HTMLPreElement>(null)
  const menBotRef = useRef<HTMLPreElement>(null)
  const floorRef = useRef<HTMLPreElement>(null)
  const spokesRef = useRef<HTMLPreElement>(null)
  const ringsRef = useRef<HTMLPreElement>(null)
  const footprintRefs = useRef<(HTMLPreElement | null)[]>(new Array(NUM_LAYERS).fill(null))
  const liftRefs = useRef<(HTMLPreElement | null)[]>(new Array(NUM_LAYERS).fill(null))
  const layerRefs = useRef<(HTMLPreElement | null)[]>(new Array(NUM_LAYERS).fill(null))

  // 3d view + drag state — all refs so pointer moves don't trigger re-renders
  const viewRef = useRef<ViewState>({
    azimuth: AZ_DEFAULT,
    elevation: EL_DEFAULT,
    vAz: 0, vEl: 0,
  })
  const dragRef = useRef<DragState | null>(null)
  // display-only mirror of view angles, pushed at ~5Hz for the footer readout
  const [viewDisplay, setViewDisplay] = useState({ az: AZ_DEFAULT, el: EL_DEFAULT })

  // phase portrait
  const phasePreRef = useRef<HTMLPreElement>(null)
  const trailRef = useRef<PhaseTrail>(new PhaseTrail(PHASE_TRAIL_SIZE))

  // metric view state, refreshed at ~5hz
  const [metricView, setMetricView] = useState<Record<string, number>>({})
  const [paramView, setParamView] = useState<Record<string, string>>({})
  const sparksRef = useRef<Map<string, SparkBuf>>(new Map())

  // build sim on preset change; clear phase trail
  useEffect(() => {
    const s = spec.create()
    simRef.current = s
    sparksRef.current = new Map()
    trailRef.current = new PhaseTrail(PHASE_TRAIL_SIZE)
    if (phasePreRef.current) phasePreRef.current.textContent = ''
    setSubIdx(0)
    if (gridSize.cols && gridSize.rows) s.reset(gridSize.cols, gridSize.rows)
    setParamView(s.params())
    setMetricView(s.metrics())
  }, [spec, gridSize.cols, gridSize.rows])

  // measure grid size from the first layer's font; re-measure on resize
  useEffect(() => {
    const wrap = wrapRef.current
    const firstLayer = layerRefs.current[0]
    if (!wrap || !firstLayer) return

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      firstLayer.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      firstLayer.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      const cols = Math.min(160, Math.max(20, Math.floor(rect.width / cw)))
      const rows = Math.min(64,  Math.max(10, Math.floor(rect.height / ch)))
      setGridSize((g) => (g.cols === cols && g.rows === rows ? g : { cols, rows }))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // main rAF loop — integrates view physics + renders chrome + sim layers
  useEffect(() => {
    const reduce = prefersReducedMotion()
    let lastMetric = 0
    let lastCssVars = { ax: -1, ay: -1 }

    const integrateView = (dtSec: number) => {
      const v = viewRef.current
      if (!dragRef.current) {
        // apply inertia with damping; if no velocity left, auto-drift
        v.azimuth   += v.vAz * dtSec
        v.elevation += v.vEl * dtSec
        const speed = Math.abs(v.vAz) + Math.abs(v.vEl)
        const damp = Math.pow(0.94, dtSec * 60)   // ≈0.94 per 60fps frame
        v.vAz *= damp
        v.vEl *= damp
        if (speed < 0.05 && !reduce) {
          // idle — slow horizontal drift so the dish feels alive
          v.azimuth += AUTO_DRIFT_RATE * dtSec
        }
      }
      // clamp elevation with tiny bounce on the velocity
      if (v.elevation < EL_MIN) {
        v.elevation = EL_MIN
        if (v.vEl < 0) v.vEl = -v.vEl * 0.35
      } else if (v.elevation > EL_MAX) {
        v.elevation = EL_MAX
        if (v.vEl > 0) v.vEl = -v.vEl * 0.35
      }
      // keep azimuth in a reasonable float range
      if (v.azimuth >  Math.PI * 4) v.azimuth -= Math.PI * 2
      if (v.azimuth < -Math.PI * 4) v.azimuth += Math.PI * 2
    }

    const paintFrame = () => {
      const s = simRef.current
      const { cols, rows } = gridSize
      if (!s || cols === 0) return

      const view: SceneView = {
        azimuth:    viewRef.current.azimuth,
        elevation:  viewRef.current.elevation,
        charAspect: CHAR_ASPECT,
      }
      const R = computeDishRadius(cols, rows, view)
      const chrome = renderDishChrome(cols, rows, view, R)

      if (rimTopRef.current)     rimTopRef.current.textContent     = chrome.rimTop
      if (rimSideRef.current)    rimSideRef.current.textContent    = chrome.rimSide
      if (rimBotRef.current)     rimBotRef.current.textContent     = chrome.rimBot
      if (rimAnchorsRef.current) rimAnchorsRef.current.textContent = chrome.rimAnchors
      if (menTopRef.current)     menTopRef.current.textContent     = chrome.meniscusTop
      if (menBotRef.current)     menBotRef.current.textContent     = chrome.meniscusBot
      if (floorRef.current)      floorRef.current.textContent      = chrome.floorDots
      if (spokesRef.current)     spokesRef.current.textContent     = chrome.floorSpokes
      if (ringsRef.current)      ringsRef.current.textContent      = chrome.floorRings

      // push dish ellipse % onto CSS vars — CSS overlays clip-path with these
      const ax = Math.round(chrome.arFrac * 1000) / 10  // 0.1% precision
      const ay = Math.round(chrome.brFrac * 1000) / 10
      if (wrapRef.current && (ax !== lastCssVars.ax || ay !== lastCssVars.ay)) {
        wrapRef.current.style.setProperty('--dish-ax', `${ax}%`)
        wrapRef.current.style.setProperty('--dish-ay', `${ay}%`)
        lastCssVars = { ax, ay }
      }

      const layers: SimLayer[] = s.renderLayers?.() ?? [{
        text: s.render(), color: 'var(--color-fg)', opacity: 1,
      }]
      for (let i = 0; i < NUM_LAYERS; i++) {
        const footEl = footprintRefs.current[i]
        const liftEl = liftRefs.current[i]
        const capEl = layerRefs.current[i]
        if (!footEl || !liftEl || !capEl) continue
        if (i < layers.length) {
          const layer = layers[i]
          const volume = renderVolumetricLayer(layer.text, cols, rows, view, R)
          const opacity = layer.opacity ?? 1
          footEl.textContent = volume.footprint
          footEl.style.color = layer.color
          footEl.style.opacity = String(opacity * 0.16)
          liftEl.textContent = volume.lift
          liftEl.style.color = layer.color
          liftEl.style.opacity = String(opacity * 0.30)
          capEl.textContent = volume.cap
          capEl.style.color = layer.color
          capEl.style.opacity = String(opacity)
        } else {
          footEl.textContent = ''
          footEl.style.opacity = '0'
          liftEl.textContent = ''
          liftEl.style.opacity = '0'
          capEl.textContent = ''
          capEl.style.opacity = '0'
        }
      }
    }

    if (reduce) {
      paintFrame()
      return
    }

    const cancel = rafLoop((t, dt) => {
      const s = simRef.current
      if (!s) return
      if (!paused) s.step(dt)
      integrateView(dt)
      paintFrame()

      if (t - lastMetric > 200) {
        lastMetric = t
        const m = s.metrics()
        for (const [k, v] of Object.entries(m)) {
          let buf = sparksRef.current.get(k)
          if (!buf) { buf = createSparkBuf(48); sparksRef.current.set(k, buf) }
          buf.push(v)
        }
        setMetricView({ ...m })
        setParamView({ ...s.params() })
        setViewDisplay({ az: viewRef.current.azimuth, el: viewRef.current.elevation })
        if (s.phase && s.phaseSpec) {
          const p = s.phase()
          if (p) trailRef.current.push(p)
          if (phasePreRef.current) {
            phasePreRef.current.textContent = renderPhase(
              trailRef.current, s.phaseSpec(), PHASE_COLS, PHASE_ROWS,
            )
          }
        }
      }
    })
    return () => cancel()
  }, [paused, gridSize.cols, gridSize.rows])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); return }
      if (e.key === 'r' || e.key === 'R') {
        simRef.current?.reseed()
        trailRef.current = new PhaseTrail(PHASE_TRAIL_SIZE)
        if (phasePreRef.current) phasePreRef.current.textContent = ''
        return
      }
      if (e.key === 'z' || e.key === 'Z') {
        viewRef.current.azimuth = AZ_DEFAULT
        viewRef.current.elevation = EL_DEFAULT
        viewRef.current.vAz = 0
        viewRef.current.vEl = 0
        return
      }
      if (e.key === 'ArrowRight') { setSimIdx((v) => (v + 1) % SIMS.length); return }
      if (e.key === 'ArrowLeft')  { setSimIdx((v) => (v - 1 + SIMS.length) % SIMS.length); return }
      if (spec.subPresets) {
        const n = parseInt(e.key, 10)
        if (!Number.isNaN(n) && n >= 1 && n <= spec.subPresets.length) {
          simRef.current?.setSubPreset?.(n - 1)
          setSubIdx(n - 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spec])

  // drag-to-rotate
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startAz: viewRef.current.azimuth,
      startEl: viewRef.current.elevation,
      lastX: e.clientX, lastY: e.clientY,
      lastT: performance.now(),
      vAz: 0, vEl: 0,
    }
    viewRef.current.vAz = 0
    viewRef.current.vEl = 0
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const newAz = d.startAz + dx * 0.0085
    const newEl = d.startEl - dy * 0.006
    // track ema velocity from the last sample
    const now = performance.now()
    const dtMs = now - d.lastT
    if (dtMs > 2) {
      const instAz = ((e.clientX - d.lastX) * 0.0085) / (dtMs / 1000)
      const instEl = -((e.clientY - d.lastY) * 0.006) / (dtMs / 1000)
      const alpha = 0.4
      d.vAz = alpha * instAz + (1 - alpha) * d.vAz
      d.vEl = alpha * instEl + (1 - alpha) * d.vEl
      d.lastX = e.clientX
      d.lastY = e.clientY
      d.lastT = now
    }
    viewRef.current.azimuth = newAz
    viewRef.current.elevation = Math.max(EL_MIN, Math.min(EL_MAX, newEl))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const wrap = wrapRef.current
    if (wrap && wrap.hasPointerCapture(e.pointerId)) {
      wrap.releasePointerCapture(e.pointerId)
    }
    // cap inertia so a flick doesn't spin forever
    viewRef.current.vAz = Math.max(-8, Math.min(8, d.vAz))
    viewRef.current.vEl = Math.max(-6, Math.min(6, d.vEl))
    dragRef.current = null
  }

  const subLabel = spec.subPresets ? spec.subPresets[subIdx] : null
  const phaseSpec = simRef.current?.phaseSpec?.()
  const hasPhase = !!phaseSpec
  const idxLabel = `${String(simIdx + 1).padStart(2, '0')}/${String(SIMS.length).padStart(2, '0')}`
  const azDeg = Math.round((((viewDisplay.az * 180 / Math.PI) % 360) + 360) % 360)
  const elDeg = Math.round(viewDisplay.el * 180 / Math.PI)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* left — 3d petri dish */}
      <Tile
        label={subLabel ? `petri · ${spec.label} · ${subLabel}` : `petri · ${spec.label}`}
        tag={idxLabel}
        footer={
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate">
              {SIMS.map((s, n) => n === simIdx ? `[${s.label}]` : s.label).join('  ·  ')}
            </span>
            <span className="shrink-0">
              drag rotate · z reset · ← → preset · r reseed · space {paused ? 'resume' : 'pause'}
              {spec.subPresets ? ` · 1–${spec.subPresets.length}` : ''}
            </span>
          </div>
        }
      >
        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative h-[72vh] w-full overflow-hidden bg-black"
          style={{ cursor: 'grab', touchAction: 'none' }}
        >
          {/* bench vignette */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 0,
              background:
                'radial-gradient(ellipse 60% 60% at 50% 55%, transparent 55%, rgba(0,0,0,0.75) 95%)',
            }}
          />
          {/* cast shadow under the dish */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 1,
              background:
                'radial-gradient(ellipse calc(var(--dish-ax, 48%) * 1.02) calc(var(--dish-ay, 25%) * 0.30) at 50% calc(50% + var(--dish-ay, 25%) * 0.85), rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)',
            }}
          />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 2,
              clipPath: DISH_CLIP,
              WebkitClipPath: DISH_CLIP,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                zIndex: 0,
                background:
                  'radial-gradient(ellipse 60% 54% at 50% 58%, rgba(120,148,166,0.16) 0%, rgba(48,62,76,0.12) 42%, rgba(0,0,0,0.40) 100%)',
              }}
            />

            {/* dish floor — dense dithered dots at y=0 */}
            <pre
              ref={floorRef}
              aria-hidden
              className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
              style={{ zIndex: 1, tabSize: 1, color: 'var(--color-line)', opacity: 0.45 }}
            />

            {/* agar rings — concentric circles on the dish floor (depth cue) */}
            <pre
              ref={ringsRef}
              aria-hidden
              className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
              style={{ zIndex: 2, tabSize: 1, color: 'var(--color-line)', opacity: 0.62 }}
            />

            {/* floor spokes — radial lines at fixed world angles. rotate with azimuth;
                this is the primary visual rotation cue. */}
            <pre
              ref={spokesRef}
              aria-hidden
              className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
              style={{ zIndex: 3, tabSize: 1, color: 'var(--color-dim)', opacity: 0.48 }}
            />

            {/* --- sim footprints and lift connectors --- */}
            {Array.from({ length: NUM_LAYERS }).map((_, i) => (
              <pre
                key={`foot-${i}`}
                ref={(el) => { footprintRefs.current[i] = el }}
                className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
                style={{
                  zIndex: 4,
                  tabSize: 1,
                  mixBlendMode: i === 0 ? 'normal' : 'screen',
                }}
              />
            ))}
            {Array.from({ length: NUM_LAYERS }).map((_, i) => (
              <pre
                key={`lift-${i}`}
                ref={(el) => { liftRefs.current[i] = el }}
                className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
                style={{
                  zIndex: 5,
                  tabSize: 1,
                  mixBlendMode: i === 0 ? 'normal' : 'screen',
                }}
              />
            ))}

            {/* --- sim content (volumetric caps above the dish floor) --- */}
            {Array.from({ length: NUM_LAYERS }).map((_, i) => (
              <pre
                key={i}
                ref={(el) => { layerRefs.current[i] = el }}
                className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
                style={{
                  zIndex: 6 + i,
                  tabSize: 1,
                  mixBlendMode: i === 0 ? 'normal' : 'screen',
                }}
              />
            ))}

            {/* --- 3d lighting overlays, clipped to the live dish ellipse --- */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                zIndex: 10,
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.46) 30%, rgba(0,0,0,0.14) 60%, rgba(0,0,0,0) 82%)',
                mixBlendMode: 'multiply',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                zIndex: 11,
                background:
                  'radial-gradient(ellipse 55% 55% at 50% 62%, rgba(180,210,230,0.18) 0%, rgba(120,150,180,0.05) 45%, rgba(0,0,0,0.30) 100%)',
                mixBlendMode: 'screen',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                zIndex: 12,
                background:
                  'radial-gradient(ellipse 58% 14% at 50% 86%, rgba(220,240,255,0.42) 0%, rgba(220,240,255,0.14) 40%, transparent 75%)',
                mixBlendMode: 'screen',
              }}
            />

            {/* meniscus reflection */}
            <pre
              ref={menTopRef}
              aria-hidden
              className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
              style={{ zIndex: 13, tabSize: 1, color: 'var(--color-line)', opacity: 0.52 }}
            />
            <pre
              ref={menBotRef}
              aria-hidden
              className="absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
              style={{ zIndex: 14, tabSize: 1, color: '#d6e2ec', opacity: 0.80 }}
            />
          </div>

          {/* rim split top/side/bot — asymmetric lighting */}
          <pre
            ref={rimTopRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
            style={{ zIndex: 15, tabSize: 1, color: '#565d66', opacity: 0.75 }}
          />
          <pre
            ref={rimSideRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
            style={{ zIndex: 16, tabSize: 1, color: '#9aa3ad', opacity: 0.95 }}
          />
          <pre
            ref={rimBotRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
            style={{
              zIndex: 17,
              tabSize: 1,
              color: '#f1f5fa',
              textShadow: '0 0 5px rgba(230,240,255,0.8), 0 0 12px rgba(200,220,255,0.35)',
            }}
          />
          {/* rim anchors — bright world-anchored diamonds that rotate with azimuth.
              the clearest visual signal that rotation is working. */}
          <pre
            ref={rimAnchorsRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 whitespace-pre text-[12px] leading-[1.0]"
            style={{
              zIndex: 18,
              tabSize: 1,
              color: '#ffd580',
              textShadow: '0 0 6px rgba(255, 213, 128, 0.9), 0 0 14px rgba(255, 180, 80, 0.5)',
            }}
          />
        </div>
      </Tile>

      {/* right — info + params + metrics + phase + keybinds */}
      <div className="flex min-w-0 flex-col gap-6">
        <Tile label="model" tag={spec.id}>
          <div className="flex flex-col gap-2 p-4 text-[12px]">
            <div className="text-[var(--color-fg)]">{spec.phenomenon}</div>
            <div className="text-[13px] tracking-[0.08em] text-[var(--color-dim)]">{spec.citation}</div>
            <pre className="m-0 whitespace-pre-wrap text-[13px] leading-[1.4] text-[var(--color-fg)]">{spec.equation}</pre>
          </div>
        </Tile>

        <Tile
          label="parameters"
          footer={<span>az {azDeg}° · el {elDeg}° · current tick</span>}
        >
          <div className="flex flex-col p-0 text-[12px]">
            {Object.entries(paramView).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </div>
        </Tile>

        <Tile label="metrics · live" footer={<span>sparklines: last ~10s · 5hz</span>}>
          <div className="flex flex-col p-0 text-[12px]">
            {Object.entries(metricView).map(([k, v]) => {
              const buf = sparksRef.current.get(k)
              const spark = buf ? buf.render(24) : ''
              return (
                <div key={k} className="flex items-baseline justify-between border-b border-[var(--color-line)] px-4 py-1.5 last:border-0">
                  <span className="tracking-[0.08em] text-[var(--color-dim)]">{k}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono tabular-nums text-[13px] text-[var(--color-dim)]">{spark}</span>
                    <span className="tabular-nums text-[var(--color-fg)]">{METRIC_FMT(k, v)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </Tile>

        {hasPhase && (
          <Tile
            label={`phase · ${phaseSpec?.xLabel ?? 'x'} / ${phaseSpec?.yLabel ?? 'y'}`}
            footer={
              <span>
                {phaseSpec ? `x ∈ [${phaseSpec.xMin}, ${phaseSpec.xMax}] · y ∈ [${phaseSpec.yMin}, ${phaseSpec.yMax}]` : ''}
              </span>
            }
          >
            <div className="p-3">
              <pre
                ref={phasePreRef}
                className="m-0 whitespace-pre text-[11px] leading-[1.05] text-[var(--color-fg)]"
                style={{ tabSize: 1 }}
              />
            </div>
          </Tile>
        )}

        <Tile label="keybinds">
          <div className="flex flex-col gap-1 p-4 text-[12px] text-[var(--color-dim)]">
            <Row label="drag" value="rotate · azimuth + elevation" />
            <Row label="z" value="reset view" />
            <Row label="← →" value="cycle preset" />
            <Row label="space" value={paused ? 'resume' : 'pause'} />
            <Row label="r" value="reseed · clear phase" />
            {spec.subPresets && (
              <Row label={`1–${spec.subPresets.length}`} value={spec.subPresets.join(' · ')} />
            )}
          </div>
        </Tile>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-line)] px-4 py-1.5 last:border-0">
      <span className="tracking-[0.08em] text-[var(--color-dim)]">{label}</span>
      <span className="tabular-nums text-[var(--color-fg)]">{value}</span>
    </div>
  )
}
