import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import type { Scene } from '../modules/scene'
import { createMatrixRain } from '../modules/matrixRain'
import { createDonut } from '../modules/donut'
import { createLife } from '../modules/life'
import { createFlowField } from '../modules/flowField'
import { createRule30 } from '../modules/rule30'
import { prefersReducedMotion } from '../lib/canvas'

export default function Terminal() {
  const scenes = useMemo<Scene[]>(() => [
    createMatrixRain(),
    createFlowField(),
    createLife(),
    createDonut(),
    createRule30(),
  ], [])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const scene = scenes[i]

  // sizing: measure char metrics once, recompute cols/rows on resize
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
      const cols = Math.max(20, Math.floor(rect.width / cw))
      const rows = Math.max(10, Math.floor(rect.height / ch))
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
    if (reduce) {
      pre.textContent = scene.frame(0)
    } else {
      raf = requestAnimationFrame(loop)
    }
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scene, paused])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % scenes.length)
      if (e.key === 'ArrowLeft')  setI((v) => (v - 1 + scenes.length) % scenes.length)
      if (e.key === ' ')          { e.preventDefault(); setPaused((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scenes.length])

  return (
    <Tile
      label={`terminal · ${scene.name}`}
      code={`${String(i + 1).padStart(2, '0')}/${String(scenes.length).padStart(2, '0')}`}
      footer={
        <div className="flex items-center justify-between">
          <span>{scenes.map((s, n) => n === i ? `[${s.name}]` : s.name).join('  ·  ')}</span>
          <span>← → cycle · space {paused ? 'resume' : 'pause'}</span>
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
