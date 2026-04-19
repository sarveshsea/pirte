import { useEffect, useRef, useState } from 'react'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { prefersReducedMotion } from '../lib/canvas'

type Phase = 'inhale' | 'hold1' | 'exhale' | 'hold2'
const PHASE_LABEL: Record<Phase, string> = { inhale: 'inhale', hold1: 'hold', exhale: 'exhale', hold2: 'hold' }
const PHASE_ORDER: Phase[] = ['inhale', 'hold1', 'exhale', 'hold2']

export default function Breathe() {
  const [inhale, setInhale]   = useState(4)
  const [hold1, setHold1]     = useState(4)
  const [exhale, setExhale]   = useState(4)
  const [hold2, setHold2]     = useState(4)
  const [paused, setPaused]   = useState(false)
  const [cycle, setCycle]     = useState(0)
  const [phase, setPhase]     = useState<Phase>('inhale')
  const [remaining, setRem]   = useState(inhale)
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(0.3)

  const durations: Record<Phase, number> = { inhale, hold1, exhale, hold2 }

  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    let elapsed = 0
    let curPhase: Phase = 'inhale'
    let localCycle = 0

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
      }
      const p = elapsed / durations[curPhase]
      // scale: inhale 0.3→1, hold1 stay 1, exhale 1→0.3, hold2 stay 0.3
      let s = scaleRef.current
      if (curPhase === 'inhale') s = 0.3 + 0.7 * eased(p)
      else if (curPhase === 'hold1') s = 1
      else if (curPhase === 'exhale') s = 1 - 0.7 * eased(p)
      else s = 0.3
      scaleRef.current = s
      setRem(Math.max(0, durations[curPhase] - elapsed))
      draw(s, curPhase)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    /* eslint-disable-next-line */
  }, [paused, inhale, hold1, exhale, hold2])

  // draw once while paused
  useEffect(() => {
    if (paused) draw(scaleRef.current, phase)
    /* eslint-disable-next-line */
  }, [paused])

  function draw(scale: number, _phase: Phase) {
    const wrap = wrapRef.current
    const pre = preRef.current
    if (!wrap || !pre) return
    // measure char cell
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
    const cx = cols / 2
    const cy = rows / 2
    const maxR = Math.min(cols, rows * 2) * 0.45
    const r = maxR * scale
    const lines: string[] = []
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        // correct for character cell aspect (chars are ~2x taller than wide)
        const dx = x - cx
        const dy = (y - cy) * 2
        const d = Math.sqrt(dx * dx + dy * dy)
        const edge = Math.abs(d - r)
        if (d < r - 0.6) {
          const t = 1 - d / Math.max(0.001, r)
          const ramp = ' ░▒▓█'
          line += ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]
        } else if (edge < 0.6) line += '●'
        else line += ' '
      }
      lines.push(line)
    }
    pre.textContent = lines.join('\n')
  }

  function eased(p: number) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v) }
      if (e.key.toLowerCase() === 'r') setCycle(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // paint once on mount so something shows before first rAF tick
    if (prefersReducedMotion() || paused) draw(scaleRef.current, phase)
    /* eslint-disable-next-line */
  }, [])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <Tile
        label={`breathe · ${PHASE_LABEL[phase]}`}
        code="11"
        footer={
          <div className="flex items-center justify-between">
            <span>cycle {cycle} · {PHASE_LABEL[phase]} {remaining.toFixed(1)}s</span>
            <span>space {paused ? 'resume' : 'pause'} · r reset</span>
          </div>
        }
      >
        <div ref={wrapRef} className="grid h-[72vh] w-full place-items-center">
          <pre
            ref={preRef}
            className="m-0 whitespace-pre text-[12px] leading-[1.0] text-[var(--color-fg)]"
          />
        </div>
      </Tile>

      <Tile label="pattern" footer={<span>box-breathing 4-4-4-4</span>}>
        <div className="flex flex-col gap-3 p-3">
          <Slider label="inhale" min={2} max={10} step={1} value={inhale} onChange={setInhale} format={(v) => `${v}s`} />
          <Slider label="hold"   min={0} max={10} step={1} value={hold1}  onChange={setHold1}  format={(v) => `${v}s`} />
          <Slider label="exhale" min={2} max={12} step={1} value={exhale} onChange={setExhale} format={(v) => `${v}s`} />
          <Slider label="hold"   min={0} max={10} step={1} value={hold2}  onChange={setHold2}  format={(v) => `${v}s`} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-dim)]">
            <button data-interactive onClick={() => { setInhale(4); setHold1(4); setExhale(4); setHold2(4) }}>4·4·4·4</button>
            <button data-interactive onClick={() => { setInhale(4); setHold1(7); setExhale(8); setHold2(0) }}>4·7·8</button>
          </div>
        </div>
      </Tile>
    </div>
  )
}
