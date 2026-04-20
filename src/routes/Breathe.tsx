import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { prefersReducedMotion } from '../lib/canvas'
import { type Kind, type Phase, PHASE_LABEL, PHASE_ORDER, phaseAccent, toHTML } from '../modules/breathe/colors'
import { setSound, tick as audioTick } from '../modules/breathe/audio'

type Mode = 'circle' | 'waveform'

export default function Breathe() {
  const [inhale, setInhale]   = useState(4)
  const [hold1, setHold1]     = useState(4)
  const [exhale, setExhale]   = useState(4)
  const [hold2, setHold2]     = useState(4)
  const [paused, setPaused]   = useState(false)
  const [cycle, setCycle]     = useState(0)
  const [phase, setPhase]     = useState<Phase>('inhale')
  const [remaining, setRem]   = useState(inhale)
  const [mode, setMode]       = useState<Mode>('circle')
  const [sound, setSoundUI]   = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(0.3)

  const durations: Record<Phase, number> = { inhale, hold1, exhale, hold2 }

  useEffect(() => { setSound(sound) }, [sound])

  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    let elapsed = 0
    let curPhase: Phase = phase
    let localCycle = cycle

    const loop = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      elapsed += dt
      const dur = durations[curPhase]
      if (elapsed >= dur) {
        elapsed -= dur
        const next = (PHASE_ORDER.indexOf(curPhase) + 1) % PHASE_ORDER.length
        curPhase = PHASE_ORDER[next]
        if (next === 0) { localCycle++; setCycle(localCycle) }
        setPhase(curPhase)
        audioTick(curPhase)
      }
      const p = elapsed / durations[curPhase]
      let s = scaleRef.current
      if (curPhase === 'inhale') s = 0.3 + 0.7 * eased(p)
      else if (curPhase === 'hold1') s = 1
      else if (curPhase === 'exhale') s = 1 - 0.7 * eased(p)
      else s = 0.3
      scaleRef.current = s
      setRem(Math.max(0, durations[curPhase] - elapsed))
      draw(preRef.current, wrapRef.current, s, curPhase, t, mode)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    /* eslint-disable-next-line */
  }, [paused, inhale, hold1, exhale, hold2, mode])

  // draw once while paused (and once on mount for reduced-motion)
  useEffect(() => {
    if (paused || prefersReducedMotion()) {
      draw(preRef.current, wrapRef.current, scaleRef.current, phase, performance.now(), mode)
    }
    /* eslint-disable-next-line */
  }, [paused, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); return }
      const k = e.key.toLowerCase()
      if (k === 'r') setCycle(0)
      else if (k === 'v') setMode((m) => (m === 'circle' ? 'waveform' : 'circle'))
      else if (k === 'm') setSoundUI((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const accent = phaseAccent(phase)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <Tile
        label={`breathe · ${PHASE_LABEL[phase]}`}
        code="11"
        footer={
          <div className="flex items-center justify-between">
            <span>
              cycle {cycle} · <span style={{ color: accent }}>{PHASE_LABEL[phase]}</span> {remaining.toFixed(1)}s
            </span>
            <span>space {paused ? 'resume' : 'pause'} · v mode · m sound · r reset</span>
          </div>
        }
      >
        <div ref={wrapRef} className="grid h-[72vh] w-full place-items-center">
          <pre
            ref={preRef}
            className="m-0 whitespace-pre text-[12px] leading-[1.0]"
          />
        </div>
      </Tile>

      <Tile label="pattern" footer={<span>box-breathing 4·4·4·4</span>}>
        <div className="flex flex-col gap-3 p-3">
          <Slider label="inhale" min={2} max={10} step={1} value={inhale} onChange={setInhale} format={(v) => `${v}s`} />
          <Slider label="hold"   min={0} max={10} step={1} value={hold1}  onChange={setHold1}  format={(v) => `${v}s`} />
          <Slider label="exhale" min={2} max={12} step={1} value={exhale} onChange={setExhale} format={(v) => `${v}s`} />
          <Slider label="hold"   min={0} max={10} step={1} value={hold2}  onChange={setHold2}  format={(v) => `${v}s`} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-dim)]">
            <button data-interactive onClick={() => { setInhale(4); setHold1(4); setExhale(4); setHold2(4) }}>4·4·4·4</button>
            <button data-interactive onClick={() => { setInhale(4); setHold1(7); setExhale(8); setHold2(0) }}>4·7·8</button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-dim)]">
            <button
              data-interactive
              onClick={() => setMode((m) => (m === 'circle' ? 'waveform' : 'circle'))}
            >
              mode · {mode}
            </button>
            <button
              data-interactive
              onClick={() => setSoundUI((v) => !v)}
              style={sound ? { color: accent } : undefined}
            >
              sound · {sound ? 'on' : 'off'}
            </button>
          </div>
        </div>
      </Tile>
    </div>
  )
}

function eased(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
}

function draw(
  pre: HTMLPreElement | null, wrap: HTMLDivElement | null,
  scale: number, curPhase: Phase, t: number, currentMode: Mode,
) {
  if (!pre || !wrap) return
  const probe = document.createElement('span')
  probe.textContent = 'M'
  probe.style.visibility = 'hidden'
  pre.appendChild(probe)
  const cw = probe.getBoundingClientRect().width || 8
  const ch = probe.getBoundingClientRect().height || 16
  pre.removeChild(probe)
  const rect = wrap.getBoundingClientRect()
  const cols = Math.max(24, Math.floor(rect.width / cw))
  const rows = Math.max(12, Math.floor(rect.height / ch))
  const { chars, kinds } = currentMode === 'circle'
    ? renderCircle(cols, rows, scale)
    : renderWaveform(cols, rows, scale, t)
  pre.innerHTML = toHTML(chars, kinds, curPhase)
}

function renderCircle(cols: number, rows: number, scale: number): { chars: string[][]; kinds: Kind[][] } {
  const chars: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
  const kinds: Kind[][]   = Array.from({ length: rows }, () => new Array<Kind>(cols).fill('blank'))
  const cx = cols / 2
  const cy = rows / 2
  const maxR = Math.min(cols, rows * 2) * 0.45
  const r = maxR * scale
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // aspect correction: chars are ~2x taller than wide
      const dx = x - cx
      const dy = (y - cy) * 2
      const d = Math.sqrt(dx * dx + dy * dy)
      const edge = Math.abs(d - r)
      if (d < r - 0.6) {
        const t = 1 - d / Math.max(0.001, r)
        const idx = Math.min(3, Math.floor(t * 4))
        const glyph = ['░', '▒', '▓', '█'][idx]
        const kind: Kind = (['faint', 'dim', 'mid', 'bright'] as Kind[])[idx]
        chars[y][x] = glyph
        kinds[y][x] = kind
      } else if (edge < 0.6) {
        chars[y][x] = '●'
        kinds[y][x] = 'ring'
      }
    }
  }
  return { chars, kinds }
}

function renderWaveform(cols: number, rows: number, scale: number, t: number): { chars: string[][]; kinds: Kind[][] } {
  const chars: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
  const kinds: Kind[][]   = Array.from({ length: rows }, () => new Array<Kind>(cols).fill('blank'))
  const midY = Math.floor(rows / 2)
  const amp = scale * Math.max(2, Math.min(rows / 2 - 1, 10))
  const freq = 0.22
  const phase = t * 0.0022
  for (let x = 0; x < cols; x++) {
    const y = midY + Math.sin(x * freq + phase) * amp
    const yi = Math.round(y)
    const frac = Math.abs(y - yi)
    const plot = (py: number, ch: string, k: Kind) => {
      if (py >= 0 && py < rows) { chars[py][x] = ch; kinds[py][x] = k }
    }
    plot(yi, '●', 'ring')
    // thickness falls off with fractional position
    if (frac < 0.4) {
      plot(yi - 1, '·', 'dim')
      plot(yi + 1, '·', 'dim')
    }
    // faint trail line along the midline for grounding
    if (chars[midY][x] === ' ') { chars[midY][x] = '·'; kinds[midY][x] = 'faint' }
  }
  return { chars, kinds }
}
