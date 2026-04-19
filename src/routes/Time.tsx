import { useEffect, useState } from 'react'
import Tile from '../components/Tile'
import { CITIES, formatTime } from '../lib/clock'
import { getSessionStart, formatElapsed, resetSession } from '../lib/session'
import { renderSevenSegment } from '../modules/sevenSegment'

export default function Time() {
  const [now, setNow] = useState(new Date())
  const [start, setStart] = useState(getSessionStart())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const reset = () => { resetSession(); setStart(getSessionStart()) }

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {CITIES.map((c) => {
        const [hm, s] = formatTime(c.tz, now).split(':').reduce<[string, string]>((acc, part, i, arr) => {
          if (i < arr.length - 1) acc[0] = (acc[0] ? acc[0] + ':' : '') + part
          else acc[1] = part
          return acc
        }, ['', ''])
        return (
          <Tile key={c.tz} label={c.label} code={c.tz} footer={<span>{formatTime(c.tz, now)}</span>}>
            <div className="grid h-[200px] place-items-center overflow-hidden">
              <pre className="m-0 whitespace-pre text-[var(--color-fg)] text-[clamp(9px,1.6vw,14px)] leading-[1.1]">
                {renderSevenSegment(`${hm}:${s}`)}
              </pre>
            </div>
          </Tile>
        )
      })}

      <Tile
        label="session"
        code="local"
        className="lg:col-span-3"
        footer={<button data-interactive onClick={reset}>reset session</button>}
      >
        <div className="grid h-[200px] place-items-center overflow-hidden">
          <pre className="m-0 whitespace-pre text-[var(--color-fg)] text-[clamp(10px,1.8vw,18px)] leading-[1.1]">
            {renderSevenSegment(formatElapsed(now.getTime() - start))}
          </pre>
        </div>
      </Tile>
    </div>
  )
}
