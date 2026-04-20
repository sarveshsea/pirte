import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { createLenia, LENIA_PRESETS } from '../modules/lenia'
import { prefersReducedMotion } from '../lib/canvas'

export default function Lenia() {
  const scene = useMemo(() => createLenia(), [])
  const [presetIdx, setPresetIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const preset = LENIA_PRESETS[presetIdx]

  useEffect(() => {
    scene.setPreset(preset.mu, preset.sigma)
    scene.reseed()
  }, [scene, preset])

  useEffect(() => {
    if (!preRef.current || !wrapRef.current) return
    const pre = preRef.current
    const wrap = wrapRef.current

    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      pre.appendChild(probe)
      const cw = probe.getBoundingClientRect().width
      const ch = probe.getBoundingClientRect().height
      pre.removeChild(probe)
      const rect = wrap.getBoundingClientRect()
      // cap grid so convolution stays ~16fps on mid-range machines
      const cols = Math.min(140, Math.max(20, Math.floor(rect.width / cw)))
      const rows = Math.min(56,  Math.max(10, Math.floor(rect.height / ch)))
      scene.reset(cols, rows)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)

    let raf = 0
    const reduce = prefersReducedMotion()
    const loop = (t: number) => {
      if (!paused) pre.textContent = scene.frame(t)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) pre.textContent = scene.frame(0)
    else raf = requestAnimationFrame(loop)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scene, paused])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v) }
      else if (e.key === 'r' || e.key === 'R') { scene.reseed() }
      else if (e.key === 'ArrowRight') setPresetIdx((v) => (v + 1) % LENIA_PRESETS.length)
      else if (e.key === 'ArrowLeft')  setPresetIdx((v) => (v - 1 + LENIA_PRESETS.length) % LENIA_PRESETS.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scene])

  return (
    <Tile
      label={`lenia · ${preset.label}`}
      code={`${String(presetIdx + 1).padStart(2, '0')}/${String(LENIA_PRESETS.length).padStart(2, '0')}`}
      footer={
        <div className="flex items-center justify-between">
          <span>{LENIA_PRESETS.map((p, n) => n === presetIdx ? `[${p.label}]` : p.label).join('  ·  ')}</span>
          <span>← → preset · r reseed · space {paused ? 'resume' : 'pause'}</span>
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
  )
}
