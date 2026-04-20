import { useEffect, useState, type CSSProperties } from 'react'
import Hourglass from './Hourglass'

// fills → twists → flies to the resting logo position and fades away.
// shown once per session; subsequent navigations skip.
// css-driven (was framer-motion) — stage changes swap classes; the
// settle stage reads the target transform from css vars so we can
// compute it from the measured logo position.
const KEY = 'pirte.splash.shown.v1'

type Rect = { left: number; top: number; width: number; height: number }

type Stage = 'fill' | 'twist' | 'settle' | 'fading' | 'gone'

export default function Splash() {
  const [stage, setStage] = useState<Stage>(() => {
    try { return sessionStorage.getItem(KEY) ? 'gone' : 'fill' } catch { return 'fill' }
  })
  const [target, setTarget] = useState<Rect | null>(null)

  useEffect(() => {
    if (stage === 'gone') return
    try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }

    const findTarget = () => {
      const el = document.querySelector('[data-logo-target]') as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setTarget({ left: r.left, top: r.top, width: r.width, height: r.height })
        return true
      }
      return false
    }

    // bounded polling — give up after ~1s; skip animation gracefully if
    // the target never mounts (layout blocked, font load stalled, etc.)
    let tries = 0
    let measureId: number | null = null
    const tryMeasure = () => {
      if (findTarget() || tries++ > 16) { measureId = null; return }
      measureId = window.setTimeout(tryMeasure, 60)
    }
    tryMeasure()

    const t1 = setTimeout(() => setStage('twist'),   900)
    const t2 = setTimeout(() => setStage('settle'),  1500)
    const t3 = setTimeout(() => setStage('fading'),  2400)
    const t4 = setTimeout(() => setStage('gone'),    2900)
    return () => {
      if (measureId !== null) clearTimeout(measureId)
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (stage === 'gone') return null

  const big = 140
  // target scale: match the resting logo height (26px) to the splash viewBox (60 units)
  const finalScale = target ? (target.height / big) : (26 / big)
  const targetLeft = target ? target.left + target.width / 2 : 44
  const targetTop  = target ? target.top  + target.height / 2 : 44

  const style: CSSProperties & Record<string, string | number> = {
    background: 'var(--color-bg)',
    ['--splash-scale']: finalScale,
    ['--splash-tx']: `${targetLeft - window.innerWidth / 2}px`,
    ['--splash-ty']: `${targetTop - window.innerHeight / 2}px`,
  }

  return (
    <div
      className={`splash-backdrop splash-${stage}`}
      style={style}
      aria-hidden
    >
      <div className="splash-shape" style={{ color: 'var(--color-fg)' }}>
        <Hourglass size={big} introFillSec={0.9} />
      </div>
    </div>
  )
}
