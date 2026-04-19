import { useEffect, useState } from 'react'
import Tile from '../components/Tile'
import { CITIES, formatTime } from '../lib/clock'
import { getSessionStart, formatElapsed } from '../lib/session'

export default function Time() {
  const [now, setNow] = useState(new Date())
  const start = getSessionStart()
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {CITIES.map((c) => (
        <Tile key={c.tz} label={c.label} code={c.tz}>
          <div className="grid h-[180px] place-items-center text-[var(--color-fg)]">
            <span className="text-[48px] tabular-nums leading-none">{formatTime(c.tz, now)}</span>
          </div>
        </Tile>
      ))}
      <Tile label="session" code="local">
        <div className="grid h-[180px] place-items-center text-[var(--color-fg)]">
          <span className="text-[48px] tabular-nums leading-none">{formatElapsed(now.getTime() - start)}</span>
        </div>
      </Tile>
    </div>
  )
}
