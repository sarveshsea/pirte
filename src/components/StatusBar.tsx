import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getSessionStart, formatElapsed } from '../lib/session'
import { formatUTC } from '../lib/clock'

type Props = { onPalette: () => void }

export default function StatusBar({ onPalette }: Props) {
  const loc = useLocation()
  const [now, setNow] = useState(Date.now())
  const [fps, setFps] = useState(60)
  const start = getSessionStart()

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (t: number) => {
      frames++
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)))
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const route = loc.pathname === '/' ? '/index' : loc.pathname

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center justify-between border-t border-[var(--color-line)] bg-[var(--color-bg)] px-4 text-[11px] text-[var(--color-dim)]"
      aria-label="status bar"
    >
      <span className="truncate">PIRTE<span className="mx-2 text-[var(--color-line)]">·</span>{route}</span>
      <div className="flex items-center gap-4">
        <span>utc {formatUTC(new Date(now))}</span>
        <span>session {formatElapsed(now - start)}</span>
        <span>{fps}fps</span>
        <button onClick={onPalette} className="!border-0 !px-0 !py-0 text-[var(--color-dim)] hover:text-[var(--color-fg)]">
          ⌘K
        </button>
      </div>
    </div>
  )
}
