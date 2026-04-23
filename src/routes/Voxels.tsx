import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rafLoop } from '../lib/rafLoop'
import { mulberry32, hashString } from '../lib/rng'
import { RULES, ruleById, formatRule, type Rule } from '../modules/voxels/rules'
import {
  createGrid, step, seed, type Grid, type SeedKind,
} from '../modules/voxels/simulation'
import {
  VoxelRenderer, type Palette,
} from '../modules/voxels/renderer'

type UIState = {
  ruleId: string
  gridSize: number
  stepsPerSec: number
  seedKind: SeedKind
  density: number
  sunX: number
  sunY: number
  sunZ: number
  voxelScale: number
  voxelOpacity: number
  beamLength: number
  beamOpacity: number
  sparse: string
  medium: string
  dense: string
  bg: string
  running: boolean
  seed: string
}

const DEFAULT_UI: Omit<UIState, 'seed'> = {
  ruleId: 'pyroclastic',
  gridSize: 18,
  stepsPerSec: 6,
  seedKind: 'sphere',
  density: 0.38,
  sunX: 0.55,
  sunY: 0.9,
  sunZ: 0.3,
  voxelScale: 0.82,
  voxelOpacity: 0.55,
  beamLength: 28,
  beamOpacity: 0.28,
  sparse: '#4073ff',
  medium: '#ffb82e',
  dense:  '#ff4861',
  bg:     '#05060a',
  running: true,
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '')
  const v = parseInt(s.length === 3
    ? s.split('').map((c) => c + c).join('')
    : s, 16)
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const n = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)))
  return '#' + [n(r), n(g), n(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function buildPalette(ui: UIState): Palette {
  return {
    sparse: hexToRgb(ui.sparse),
    medium: hexToRgb(ui.medium),
    dense:  hexToRgb(ui.dense),
    frame:  [1, 1, 1],
    background: hexToRgb(ui.bg),
  }
}

export default function Voxels() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<VoxelRenderer | null>(null)
  const gridsRef = useRef<{ a: Grid; b: Grid } | null>(null)
  const genRef = useRef(0)
  const accumRef = useRef(0)
  const uiRef = useRef<UIState | null>(null)
  const [params, setParams] = useSearchParams()

  const [seedStr] = useState(() => params.get('seed') || Math.random().toString(36).slice(2, 8))
  const [ui, setUi] = useState<UIState>(() => {
    const p = (k: string) => params.get(k)
    const num = (k: string, fb: number) => {
      const v = p(k); const n = v == null ? NaN : parseFloat(v)
      return Number.isFinite(n) ? n : fb
    }
    return {
      ...DEFAULT_UI,
      ruleId: p('r') || DEFAULT_UI.ruleId,
      gridSize: Math.max(8, Math.min(32, Math.round(num('n', DEFAULT_UI.gridSize)))),
      stepsPerSec: Math.max(0, Math.min(30, num('fps', DEFAULT_UI.stepsPerSec))),
      density: Math.max(0, Math.min(1, num('d', DEFAULT_UI.density))),
      seedKind: (p('k') as SeedKind) || 'sphere',
      seed: seedStr,
    }
  })
  // stats go to DOM via refs — never touches React state, never causes rerenders
  const fpsRef = useRef<HTMLSpanElement>(null)
  const genStatRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const [controlsOpen, setControlsOpen] = useState(true)
  const rule = useMemo<Rule>(() => ruleById(ui.ruleId), [ui.ruleId])

  // keep a ref of current ui so rafLoop sees the latest values without reinit
  useEffect(() => { uiRef.current = ui }, [ui])

  // persist a minimal set of ui knobs to URL
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        p.set('r', ui.ruleId)
        p.set('n', String(ui.gridSize))
        p.set('fps', String(ui.stepsPerSec))
        p.set('d', ui.density.toFixed(2))
        p.set('k', ui.seedKind)
        p.set('seed', ui.seed)
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [ui.ruleId, ui.gridSize, ui.stepsPerSec, ui.density, ui.seedKind, ui.seed, setParams])

  // init renderer + simulation once
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const renderer = new VoxelRenderer({
      canvas,
      gridSize: ui.gridSize,
      palette: buildPalette(ui),
      voxelScale: ui.voxelScale,
      voxelOpacity: ui.voxelOpacity,
      beamLength: ui.beamLength,
      beamOpacity: ui.beamOpacity,
      sunDir: [ui.sunX, ui.sunY, ui.sunZ],
    })
    rendererRef.current = renderer

    const a = createGrid(ui.gridSize)
    const b = createGrid(ui.gridSize)
    const rand = mulberry32(hashString(ui.seed))
    seed(ui.seedKind, a, rule, rand, ui.density)
    gridsRef.current = { a, b }
    genRef.current = 0
    accumRef.current = 0

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      renderer.resize(rect.width, rect.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // fps tracking — ring buffer (no array growth / shift per frame)
    const ft = new Float32Array(30)
    let ftHead = 0
    let ftCount = 0
    // throttled dom-stats write (every ~150ms — reading textContent is cheap,
    // but setting it is ~1 layout cost per element)
    let lastStatWrite = 0
    let lastFps = 0, lastGen = -1, lastPop = -1

    const stop = rafLoop((t, dt) => {
      const ref = rendererRef.current
      const gg = gridsRef.current
      const u = uiRef.current
      if (!ref || !gg || !u) return

      // advance simulation at stepsPerSec
      if (u.running && u.stepsPerSec > 0) {
        accumRef.current += dt
        const interval = 1 / u.stepsPerSec
        let steps = 0
        while (accumRef.current >= interval && steps < 3) {
          const r = ruleById(u.ruleId)
          const res = step(gg.a, gg.b, r, genRef.current)
          gridsRef.current = { a: gg.b, b: gg.a }
          genRef.current++
          accumRef.current -= interval
          steps++
          if (res.alive === 0 && genRef.current > 2) {
            accumRef.current = 0
            break
          }
        }
      }

      const current = gridsRef.current!.a
      const r = ruleById(u.ruleId)
      const out = ref.update(current, genRef.current, r.states - 1)
      ref.render()

      // ring-buffer fps
      ft[ftHead] = t
      ftHead = (ftHead + 1) % ft.length
      if (ftCount < ft.length) ftCount++
      let fps = 0
      if (ftCount > 1) {
        const oldest = ft[(ftHead - ftCount + ft.length) % ft.length]
        fps = (1000 * (ftCount - 1)) / Math.max(1, t - oldest)
      }

      // HUD update via direct DOM writes — no react rerender triggered.
      // throttled to ~6 Hz to keep text-measurement cost bounded.
      if (t - lastStatWrite > 160) {
        lastStatWrite = t
        const fpsN = Math.round(fps)
        if (fpsN !== lastFps && fpsRef.current) {
          lastFps = fpsN
          fpsRef.current.textContent = String(fpsN).padStart(2, '0')
        }
        if (genRef.current !== lastGen && genStatRef.current) {
          lastGen = genRef.current
          genStatRef.current.textContent = String(genRef.current).padStart(4, '0')
        }
        if (out.alive !== lastPop && popRef.current) {
          lastPop = out.alive
          popRef.current.textContent = String(out.alive).padStart(4, '0')
        }
      }
    })

    return () => {
      stop()
      ro.disconnect()
      renderer.destroy()
      rendererRef.current = null
      gridsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // respond to live ui changes that don't require full reinit
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setPalette(buildPalette(ui))
    r.setVoxelScale(ui.voxelScale)
    r.setVoxelOpacity(ui.voxelOpacity)
    r.setBeamLength(ui.beamLength)
    r.setBeamOpacity(ui.beamOpacity)
    r.setSunDir([ui.sunX, ui.sunY, ui.sunZ])
  }, [ui.bg, ui.sparse, ui.medium, ui.dense, ui.voxelScale, ui.voxelOpacity,
      ui.beamLength, ui.beamOpacity, ui.sunX, ui.sunY, ui.sunZ])

  // grid size change — rebuild grids + wire frame
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setGridSize(ui.gridSize)
    const a = createGrid(ui.gridSize)
    const b = createGrid(ui.gridSize)
    const rand = mulberry32(hashString(ui.seed))
    seed(ui.seedKind, a, rule, rand, ui.density)
    gridsRef.current = { a, b }
    genRef.current = 0
    accumRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.gridSize])

  // reseed when rule / seedKind / density / seed string change
  useEffect(() => {
    const gg = gridsRef.current
    if (!gg) return
    const rand = mulberry32(hashString(ui.seed))
    seed(ui.seedKind, gg.a, rule, rand, ui.density)
    gg.b.cells.fill(0); gg.b.birthDensity.fill(0); gg.b.birthGen.fill(0)
    genRef.current = 0
    accumRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.ruleId, ui.seedKind, ui.density, ui.seed])

  const reseed = () => {
    setUi((u) => ({ ...u, seed: Math.random().toString(36).slice(2, 8) }))
  }

  const patch = <K extends keyof UIState>(k: K, v: UIState[K]) => setUi((u) => ({ ...u, [k]: v }))

  // legend pills for sparse/medium/dense
  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">voxel life</h1>
          <div className="mt-2 text-[13px] tracking-[0.12em] text-[var(--color-dim)]">
            3d cellular automata · stained-glass voxels · volumetric shafts
          </div>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-[var(--color-dim)]">
          <span className="tabular-nums">{rule.name}</span>
          <span className="text-[var(--color-line)]">·</span>
          <span className="font-mono text-[var(--color-fg)]">{formatRule(rule)}</span>
          <button data-interactive onClick={reseed} className="!px-3 !py-1 text-[13px]">↻ reseed</button>
          <button
            data-interactive
            onClick={() => patch('running', !ui.running)}
            className="!px-3 !py-1 text-[13px]"
          >{ui.running ? '⏸ pause' : '▶ play'}</button>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-black"
        style={{ aspectRatio: '16 / 10', minHeight: 520 }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* top-left: legend */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-[6px] border border-white/10 bg-black/50 px-3 py-2 text-[11px] tracking-[0.18em] text-white/80 backdrop-blur-md">
          <div className="mb-1.5 text-white">3d cellular automata</div>
          <LegendDot color={ui.sparse} label="sparse" />
          <LegendDot color={ui.medium} label="medium" />
          <LegendDot color={ui.dense}  label="dense" />
        </div>

        {/* top-right: controls toggle */}
        <div className="absolute right-3 top-3 z-10">
          <button
            data-interactive
            onClick={() => setControlsOpen((v) => !v)}
            className="!rounded-[6px] !border-white/15 !bg-black/55 !px-3 !py-1.5 text-[12px] tracking-[0.14em] text-white backdrop-blur-md hover:!border-white/60"
          >controls {controlsOpen ? '−' : '+'}</button>
        </div>

        {controlsOpen && (
          <div className="absolute right-3 top-12 z-10 flex w-[260px] flex-col gap-3 rounded-[6px] border border-white/10 bg-black/55 p-3 text-[12px] text-white/80 backdrop-blur-md">
            <Section label="rule">
              <select
                value={ui.ruleId}
                onChange={(e) => patch('ruleId', e.target.value)}
                className="w-full rounded-[4px] border border-white/15 bg-black/40 px-2 py-1 text-white"
                data-interactive
              >
                {RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <div className="mt-1 text-[10px] tracking-[0.14em] text-white/50">{rule.blurb}</div>
            </Section>

            <Section label="simulation">
              <MiniSlider label="grid" value={ui.gridSize} min={8} max={28} step={1}
                onChange={(v) => patch('gridSize', v)} fmt={(v) => `${v}³`} />
              <MiniSlider label="speed" value={ui.stepsPerSec} min={0} max={24} step={0.5}
                onChange={(v) => patch('stepsPerSec', v)} fmt={(v) => `${v.toFixed(1)}/s`} />
              <MiniSlider label="density" value={ui.density} min={0.005} max={0.8} step={0.005}
                onChange={(v) => patch('density', v)} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
              <div className="mt-1 flex gap-1">
                {(['sphere', 'single', 'plane'] as SeedKind[]).map((k) => (
                  <button
                    key={k}
                    data-interactive
                    onClick={() => patch('seedKind', k)}
                    className={`flex-1 !rounded-[4px] !px-2 !py-1 text-[11px] ${
                      ui.seedKind === k
                        ? '!border-white/70 !bg-white/10 text-white'
                        : '!border-white/15 !bg-black/40 text-white/60'
                    }`}
                  >{k}</button>
                ))}
              </div>
            </Section>

            <Section label="lighting">
              <MiniSlider label="sun x" value={ui.sunX} min={-1} max={1} step={0.02}
                onChange={(v) => patch('sunX', v)} fmt={(v) => v.toFixed(2)} />
              <MiniSlider label="sun y" value={ui.sunY} min={-1} max={1} step={0.02}
                onChange={(v) => patch('sunY', v)} fmt={(v) => v.toFixed(2)} />
              <MiniSlider label="sun z" value={ui.sunZ} min={-1} max={1} step={0.02}
                onChange={(v) => patch('sunZ', v)} fmt={(v) => v.toFixed(2)} />
              <MiniSlider label="cube size" value={ui.voxelScale} min={0.2} max={1} step={0.01}
                onChange={(v) => patch('voxelScale', v)} fmt={(v) => v.toFixed(2)} />
              <MiniSlider label="cube alpha" value={ui.voxelOpacity} min={0.05} max={1} step={0.01}
                onChange={(v) => patch('voxelOpacity', v)} fmt={(v) => v.toFixed(2)} />
              <MiniSlider label="beam len" value={ui.beamLength} min={0} max={80} step={1}
                onChange={(v) => patch('beamLength', v)} fmt={(v) => v.toFixed(0)} />
              <MiniSlider label="beam alpha" value={ui.beamOpacity} min={0} max={1} step={0.01}
                onChange={(v) => patch('beamOpacity', v)} fmt={(v) => v.toFixed(2)} />
            </Section>

            <Section label="scene">
              <ColorRow label="bg"     value={ui.bg}     onChange={(v) => patch('bg', v)} />
              <ColorRow label="sparse" value={ui.sparse} onChange={(v) => patch('sparse', v)} />
              <ColorRow label="medium" value={ui.medium} onChange={(v) => patch('medium', v)} />
              <ColorRow label="dense"  value={ui.dense}  onChange={(v) => patch('dense', v)} />
              <div className="mt-1 flex gap-1">
                <button data-interactive onClick={() => setUi((u) => ({ ...u, ...DEFAULT_UI }))}
                  className="flex-1 !rounded-[4px] !px-2 !py-1 text-[11px] !border-white/15 !bg-black/40">reset</button>
                <button data-interactive onClick={() => {
                  const p = rgbToHex([Math.random(), Math.random(), Math.random()])
                  const m = rgbToHex([Math.random(), Math.random(), Math.random()])
                  const d = rgbToHex([Math.random(), Math.random(), Math.random()])
                  setUi((u) => ({ ...u, sparse: p, medium: m, dense: d }))
                }} className="flex-1 !rounded-[4px] !px-2 !py-1 text-[11px] !border-white/15 !bg-black/40">random</button>
              </div>
            </Section>
          </div>
        )}

        {/* bottom-left: grid label */}
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] tracking-[0.18em] text-white/55">
          GRID · {ui.gridSize}³
        </div>

        {/* bottom-right: stats */}
        <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[11px] tracking-[0.18em] text-white/55">
          <div>FPS · <span ref={fpsRef} className="tabular-nums">00</span></div>
          <div>GEN · <span ref={genStatRef} className="tabular-nums">0000</span></div>
          <div>POP · <span ref={popRef} className="tabular-nums">0000</span></div>
        </div>
      </div>

      {/* meta strip — rule analytics */}
      <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <Meta title="rule" value={rule.name} sub={formatRule(rule)} />
        <Meta title="neighborhood" value={rule.neighborhood === 'M' ? 'moore · 26' : 'von neumann · 6'} sub={`${rule.states} states`} />
        <Meta title="survival" value={fmtSet(rule.survival)} sub={`${rule.survival.length} values`} />
        <Meta title="birth"    value={fmtSet(rule.birth)}    sub={`${rule.birth.length} values`} />
      </div>

      <p className="text-[13px] leading-relaxed text-[var(--color-dim)]">
        each cell lives in a 3d toroidal grid under a rule of the form <span className="font-mono text-[var(--color-fg)]">S / B / C / N</span>:
        survival counts <span className="font-mono text-[var(--color-fg)]">{fmtSet(rule.survival)}</span>, birth counts <span className="font-mono text-[var(--color-fg)]">{fmtSet(rule.birth)}</span>,
        {' '}{rule.states} decay states, {rule.neighborhood === 'M' ? '26-neighbor moore' : '6-neighbor von-neumann'}.
        voxels are colored by their <em>birth density</em> — how crowded the neighborhood was at the moment of birth — and fade through
        decay states as the cell ages. shafts of light extend from each cell that faces open space along the sun direction, giving the
        volumetric stained-glass read of measure_plan&apos;s original piece without a full raymarch.
      </p>
    </div>
  )
}

function fmtSet(xs: number[]) {
  if (xs.length === 0) return '∅'
  const s = [...xs].sort((a, b) => a - b)
  const parts: string[] = []
  let i = 0
  while (i < s.length) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    parts.push(j === i ? `${s[i]}` : `${s[i]}-${s[j]}`)
    i = j + 1
  }
  return parts.join(',')
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] tracking-[0.2em] text-white/50">{label.toUpperCase()}</div>
      {children}
    </div>
  )
}

function MiniSlider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; fmt?: (v: number) => string
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-[56px] tracking-[0.12em] text-white/55">{label.toUpperCase()}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="w-[44px] text-right tabular-nums text-white/85">{fmt ? fmt(value) : value}</span>
    </label>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-[56px] tracking-[0.12em] text-white/55">{label.toUpperCase()}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-full cursor-pointer rounded-[3px] border border-white/15 bg-transparent p-0"
        data-interactive
      />
    </label>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5" style={{ background: color }} />
      <span>{label.toUpperCase()}</span>
    </div>
  )
}

function Meta({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-3">
      <div className="text-[10px] tracking-[0.2em] text-[var(--color-dim)]">{title.toUpperCase()}</div>
      <div className="mt-0.5 font-mono text-[13px] text-[var(--color-fg)]">{value}</div>
      <div className="mt-0.5 font-mono text-[11px] text-[var(--color-dim)]">{sub}</div>
    </div>
  )
}
