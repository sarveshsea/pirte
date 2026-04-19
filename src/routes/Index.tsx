import { useEffect, useState, type ReactNode } from 'react'
import Tile from '../components/Tile'
import { CITIES, formatTime } from '../lib/clock'
import { getSessionStart, formatElapsed } from '../lib/session'
import {
  ThumbMatrix,
  ThumbClifford,
  ThumbAscii,
  ThumbMandelbrot,
  ThumbPixels,
  ThumbTime,
  ThumbKaleidoscope,
} from '../components/Thumb'

type Mod = { to: string; label: string; code: string; desc: string; thumb: ReactNode; span?: string }

const MODULES: Mod[] = [
  { to: '/fractals',     label: 'fractals',     code: '01', desc: 'mandelbrot · julia',              thumb: <ThumbMandelbrot />,   span: 'lg:col-span-2 lg:row-span-2' },
  { to: '/attractors',   label: 'attractors',   code: '02', desc: 'lorenz · clifford · dejong',      thumb: <ThumbClifford /> },
  { to: '/ascii',        label: 'ascii',        code: '03', desc: 'image → text',                    thumb: <ThumbAscii /> },
  { to: '/terminal',     label: 'terminal',     code: '04', desc: 'rain · donut · life · flow · 30', thumb: <ThumbMatrix />,       span: 'lg:col-span-2' },
  { to: '/kaleidoscope', label: 'kaleidoscope', code: '07', desc: 'n-fold mirror',                   thumb: <ThumbKaleidoscope /> },
  { to: '/pixels',       label: 'pixels',       code: '05', desc: 'fill game',                       thumb: <ThumbPixels /> },
  { to: '/time',         label: 'time',         code: '06', desc: 'global clocks',                   thumb: <ThumbTime />,         span: 'lg:col-span-2' },
]

export default function Index() {
  const [now, setNow] = useState(new Date())
  const start = getSessionStart()
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <span className="inline-block h-[28px] w-[16px] bg-[var(--color-fg)]" aria-hidden />
            <h1 className="text-[40px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">pirte</h1>
            <span className="text-[11px] tracking-[0.18em] text-[var(--color-dim)]">etrip · abstractions for the wandering mind</span>
          </div>
          <span className="text-[11px] tracking-[0.1em] text-[var(--color-dim)]">press ⌘k · jump</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-dim)] md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7">
          {CITIES.map((c) => (
            <div key={c.tz} className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1">
              <span className="tracking-[0.12em]">{c.label}</span>
              <span className="tabular-nums text-[var(--color-fg)]">{formatTime(c.tz, now)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 xl:col-span-1">
            <span className="tracking-[0.12em]">session</span>
            <span className="tabular-nums text-[var(--color-fg)]">{formatElapsed(now.getTime() - start)}</span>
          </div>
        </div>
      </header>

      <section className="grid auto-rows-[220px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {MODULES.map((m) => (
          <Tile
            key={m.to}
            to={m.to}
            label={m.label}
            code={m.code}
            className={m.span ?? ''}
            footer={<span>{m.desc}</span>}
          >
            <div className="h-full w-full">{m.thumb}</div>
          </Tile>
        ))}
      </section>
    </div>
  )
}
