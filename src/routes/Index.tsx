import { useEffect, useState } from 'react'
import Tile from '../components/Tile'
import { CITIES, formatTime } from '../lib/clock'
import { getSessionStart, formatElapsed } from '../lib/session'

const MODULES = [
  { to: '/fractals',     label: 'fractals',     code: '01', desc: 'mandelbrot · julia' },
  { to: '/attractors',   label: 'attractors',   code: '02', desc: 'lorenz · clifford · dejong' },
  { to: '/ascii',        label: 'ascii',        code: '03', desc: 'image → text' },
  { to: '/terminal',     label: 'terminal',     code: '04', desc: 'algorithmic loops' },
  { to: '/pixels',       label: 'pixels',       code: '05', desc: 'fill game' },
  { to: '/time',         label: 'time',         code: '06', desc: 'global clocks' },
  { to: '/kaleidoscope', label: 'kaleidoscope', code: '07', desc: 'n-fold mirror' },
]

export default function Index() {
  const [now, setNow] = useState(new Date())
  const start = getSessionStart()
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex flex-col gap-3 border-b border-[var(--color-line)] pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[32px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">PIRTE</h1>
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-dim)]">etrip · abstractions for the wandering mind</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-dim)] md:grid-cols-6">
          {CITIES.map((c) => (
            <div key={c.tz} className="flex items-center justify-between border border-[var(--color-line)] px-2 py-1">
              <span className="uppercase tracking-[0.15em]">{c.label}</span>
              <span className="tabular-nums text-[var(--color-fg)]">{formatTime(c.tz, now)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-[var(--color-dim)]">
          <span>session · <span className="tabular-nums text-[var(--color-fg)]">{formatElapsed(now.getTime() - start)}</span></span>
          <span>press ⌘K · jump</span>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((m, i) => (
          <Tile
            key={m.to}
            to={m.to}
            label={m.label}
            code={m.code}
            className={i === 0 ? 'lg:col-span-2 lg:row-span-2 min-h-[240px] lg:min-h-[360px]' : 'min-h-[180px]'}
            footer={<span>{m.desc}</span>}
          >
            <div className="grid h-full place-items-center text-[var(--color-dim)]">
              <span className="text-[11px] uppercase tracking-[0.2em]">[ open ]</span>
            </div>
          </Tile>
        ))}
      </section>
    </div>
  )
}
