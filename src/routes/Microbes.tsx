import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { SIMS, type SimInstance } from '../modules/microbes/index'
import { createSparkBuf, type SparkBuf } from '../modules/microbes/sparkline'
import { prefersReducedMotion } from '../lib/canvas'
import { rafLoop } from '../lib/rafLoop'

/* microbes — four real microbiology simulations rendered as ascii data-art.
   physarum · turing · chemotaxis · excitable.
   cycle with ← → · reseed with r · pause with space · 1–4 gray-scott regimes. */

const METRIC_FMT = (k: string, v: number): string => {
  if (Number.isNaN(v)) return '—'
  // integers for counts
  if (/agents|period|peak|τ/.test(k)) return v >= 100 ? v.toFixed(0) : v.toFixed(2)
  // percentages for fractions
  if (v >= 0 && v <= 1 && !/mean|Du|Dv|ε|α|β/.test(k)) return (v * 100).toFixed(1) + '%'
  return Math.abs(v) < 0.01 ? v.toExponential(2) : v.toFixed(3)
}

export default function Microbes() {
  const [simIdx, setSimIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [gridSize, setGridSize] = useState({ cols: 0, rows: 0 })
  const [subIdx, setSubIdx] = useState(0)

  const spec = SIMS[simIdx]
  const simRef = useRef<SimInstance | null>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // live metric display state, refreshed at ~5hz to avoid react churn
  const [metricView, setMetricView] = useState<Record<string, number>>({})
  const [paramView, setParamView] = useState<Record<string, string>>({})
  const sparksRef = useRef<Map<string, SparkBuf>>(new Map())

  // build sim on preset change
  useEffect(() => {
    const s = spec.create()
    simRef.current = s
    sparksRef.current = new Map()
    setSubIdx(0)
    if (gridSize.cols && gridSize.rows) s.reset(gridSize.cols, gridSize.rows)
    setParamView(s.params())
    setMetricView(s.metrics())
  }, [spec, gridSize.cols, gridSize.rows])

  // main loop
  useEffect(() => {
    const pre = preRef.current
    const wrap = wrapRef.current
    if (!pre || !wrap) return

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      const cols = Math.min(140, Math.max(20, Math.floor(rect.width / cw)))
      const rows = Math.min(56,  Math.max(10, Math.floor(rect.height / ch)))
      setGridSize((g) => (g.cols === cols && g.rows === rows ? g : { cols, rows }))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    const reduce = prefersReducedMotion()
    let lastMetric = 0
    const cancel = rafLoop((t, dt) => {
      const s = simRef.current
      if (!s) return
      if (!paused && !reduce) s.step(dt)
      pre.textContent = s.render()
      // refresh metrics + sparklines ~5x per second
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
      }
    })
    if (reduce) {
      const s = simRef.current
      if (s) pre.textContent = s.render()
    }
    return () => { ro.disconnect(); cancel() }
  }, [paused])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); return }
      if (e.key === 'r' || e.key === 'R') { simRef.current?.reseed(); return }
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

  const subLabel = spec.subPresets ? spec.subPresets[subIdx] : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      {/* left — simulation */}
      <Tile
        label={subLabel ? `microbes · ${spec.label} · ${subLabel}` : `microbes · ${spec.label}`}
        code={`${String(simIdx + 1).padStart(2, '0')}/${String(SIMS.length).padStart(2, '0')}`}
        footer={
          <div className="flex items-center justify-between gap-4">
            <span>{SIMS.map((s, n) => n === simIdx ? `[${s.label}]` : s.label).join('  ·  ')}</span>
            <span>
              ← → preset · r reseed · space {paused ? 'resume' : 'pause'}
              {spec.subPresets ? ` · 1–${spec.subPresets.length} regime` : ''}
            </span>
          </div>
        }
      >
        <div ref={wrapRef} className="h-[72vh] w-full overflow-hidden">
          <pre
            ref={preRef}
            className="m-0 h-full w-full whitespace-pre text-[12px] leading-[1.1] text-[var(--color-fg)]"
            style={{ tabSize: 1 }}
          />
        </div>
      </Tile>

      {/* right — info + params + metrics + keybinds */}
      <div className="flex flex-col gap-6">
        <Tile label="model" code={spec.id}>
          <div className="flex flex-col gap-2 p-4 text-[12px]">
            <div className="text-[var(--color-fg)]">{spec.phenomenon}</div>
            <div className="text-[13px] tracking-[0.08em] text-[var(--color-dim)]">{spec.citation}</div>
            <pre className="m-0 whitespace-pre-wrap text-[13px] leading-[1.4] text-[var(--color-fg)]">{spec.equation}</pre>
          </div>
        </Tile>

        <Tile label="parameters" footer={<span>values at current tick</span>}>
          <div className="flex flex-col p-0 text-[12px]">
            {Object.entries(paramView).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </div>
        </Tile>

        <Tile label="metrics · live" footer={<span>sparklines: last ~10s · updated 5hz</span>}>
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

        <Tile label="keybinds">
          <div className="flex flex-col gap-1 p-4 text-[12px] text-[var(--color-dim)]">
            <Row label="← →" value="cycle preset" />
            <Row label="space" value={paused ? 'resume' : 'pause'} />
            <Row label="r" value="reseed" />
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
