import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Hourglass from './Hourglass'

// fills → twists → flies to the resting logo position and fades away.
// shown once per session; subsequent navigations skip.
const KEY = 'pirte.splash.shown.v1'

type Rect = { left: number; top: number; width: number; height: number }

type Stage = 'fill' | 'twist' | 'settle' | 'gone'

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

    const tryMeasure = () => {
      if (!findTarget()) setTimeout(tryMeasure, 60)
    }
    tryMeasure()

    const t1 = setTimeout(() => setStage('twist'),  900)
    const t2 = setTimeout(() => setStage('settle'), 1500)
    const t3 = setTimeout(() => setStage('gone'),   2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const big = 140
  // target scale: match the resting logo height (26px) to the splash viewBox (60 units)
  const finalScale = target ? (target.height / big) : (26 / big)
  const targetLeft = target ? target.left + target.width / 2 : 44
  const targetTop  = target ? target.top  + target.height / 2 : 44

  return (
    <AnimatePresence>
      {stage !== 'gone' && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center"
          style={{ background: 'var(--color-bg)' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.5, 0, 0.3, 1] }}
        >
          <motion.div
            initial={{
              scale: 0.6,
              opacity: 0,
              x: 0, y: 0,
            }}
            animate={
              stage === 'fill' ? {
                scale: 1, opacity: 1, x: 0, y: 0,
              } : stage === 'twist' ? {
                scale: 1, opacity: 1, x: 0, y: 0,
              } : {
                scale: finalScale,
                opacity: 1,
                x: targetLeft  - window.innerWidth  / 2,
                y: targetTop   - window.innerHeight / 2,
              }
            }
            transition={
              stage === 'fill' ? { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }
              : stage === 'twist' ? { duration: 0.4 }
              : { duration: 0.8, ease: [0.5, 0, 0.2, 1] }
            }
            style={{ willChange: 'transform', color: 'var(--color-fg)' }}
          >
            <Hourglass size={big} introFillSec={0.9} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
