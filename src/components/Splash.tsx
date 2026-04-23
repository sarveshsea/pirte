import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/canvas'

const KEY = 'pirte.splash.wordmark.v2'

type Stage = 'enter' | 'settle' | 'fade' | 'gone'

export default function Splash() {
  const [enabled] = useState(() => {
    try {
      return !sessionStorage.getItem(KEY)
    } catch {
      return true
    }
  })
  const [stage, setStage] = useState<Stage>(enabled ? 'enter' : 'gone')

  useEffect(() => {
    if (!enabled) return

    const reduce = prefersReducedMotion()

    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      // ignore
    }

    const settleAt = reduce ? 0 : 720
    const fadeAt = reduce ? 680 : 1960
    const doneAt = reduce ? 1120 : 2580

    const timers = [
      settleAt > 0 ? window.setTimeout(() => setStage('settle'), settleAt) : 0,
      window.setTimeout(() => setStage('fade'), fadeAt),
      window.setTimeout(() => setStage('gone'), doneAt),
    ]

    return () => {
      for (const timer of timers) {
        if (timer) window.clearTimeout(timer)
      }
    }
  }, [enabled])

  if (stage === 'gone') return null

  return (
    <div className={`splash-backdrop splash-${stage}`} aria-hidden>
      <div className="splash-aura splash-aura--left" />
      <div className="splash-aura splash-aura--right" />

      <div className="splash-wordmark-shell">
        <div className="splash-wordmark-sheen" />
        <div className="splash-wordmark-glow" />
        <div className="splash-wordmark-text">pirt,e</div>
      </div>
    </div>
  )
}
