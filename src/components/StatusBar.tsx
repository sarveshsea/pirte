import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getSessionStart, formatElapsed } from '../lib/session'
import { formatUTC } from '../lib/clock'
import { rafLoop } from '../lib/rafLoop'

type Props = { onPalette: () => void; onShortcuts?: () => void; onWM?: () => void }

export default function StatusBar({ onPalette, onShortcuts, onWM }: Props) {
  const loc = useLocation()
  const [now, setNow] = useState(Date.now())
  const [fps, setFps] = useState(60)
  const [coord, setCoord] = useState({ x: 0, y: 0 })
  const start = getSessionStart()

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    return rafLoop((t) => {
      frames++
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)))
        frames = 0
        last = t
      }
    })
  }, [])

  // rAF-throttled cursor coord tracking
  useEffect(() => {
    let pending = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => { pending = { x: e.clientX, y: e.clientY } }
    window.addEventListener('pointermove', onMove, { passive: true })
    const stop = rafLoop(() => setCoord(pending))
    return () => { window.removeEventListener('pointermove', onMove); stop() }
  }, [])

  const route = loc.pathname === '/' ? '/index' : loc.pathname
  const col = Math.floor(coord.x / 96)
  const row = Math.floor(coord.y / 96)
  const pad = (n: number) => String(n).padStart(3, '0')

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex h-7 items-center justify-between border-t border-[var(--color-line)] bg-[var(--color-surface)]/80 px-4 text-[11px] text-[var(--color-dim)] backdrop-blur-md"
      aria-label="status bar"
    >
      <span className="truncate">pirte<span className="mx-2 text-[var(--color-line)]">·</span>{route}</span>
      <div className="flex items-center gap-4">
        <span className="tabular-nums">x<span className="text-[var(--color-fg)]">{pad(coord.x)}</span> y<span className="text-[var(--color-fg)]">{pad(coord.y)}</span></span>
        <span className="tabular-nums text-[var(--color-line)]">[{col},{row}]</span>
        <span>utc {formatUTC(new Date(now))}</span>
        <span>session {formatElapsed(now - start)}</span>
        <span>{fps}fps</span>
        {onWM && (
          <button onClick={onWM} className="!border-0 !px-0 !py-0 text-[var(--color-dim)] hover:text-[var(--color-fg)]" title="tiling window manager · alt+space">
            ▦ wm
          </button>
        )}
        {onShortcuts && (
          <button onClick={onShortcuts} className="!border-0 !px-0 !py-0 text-[var(--color-dim)] hover:text-[var(--color-fg)]" title="keyboard shortcuts · ?">
            ?
          </button>
        )}
        <button onClick={onPalette} className="!border-0 !px-0 !py-0 text-[var(--color-dim)] hover:text-[var(--color-fg)]" title="command palette · ⌘k">
          ⌘K
        </button>
      </div>
    </div>
  )
}
