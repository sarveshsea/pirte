import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Tile from '../components/Tile'
import { CITIES, formatTime } from '../lib/clock'
import { getSessionStart, formatElapsed } from '../lib/session'
import { getFavs, toggleFav } from '../lib/favs'
import {
  ThumbMatrix,
  ThumbClifford,
  ThumbAscii,
  ThumbMandelbrot,
  ThumbPixels,
  ThumbTime,
  ThumbKaleidoscope,
  ThumbSprites,
  ThumbWaves,
  ThumbDoom,
  ThumbBreathe,
  ThumbStarfield,
  ThumbTarot,
  ThumbParticles,
  ThumbCyber,
  ThumbFolds,
  ThumbOrbit,
  ThumbRadio,
  ThumbSpinners,
} from '../components/Thumb'

type Tag = 'visual' | 'interactive' | 'audio' | 'meditative' | 'live' | 'game'
type Mod = { to: string; label: string; code: string; desc: string; thumb: ReactNode; span?: string; tags: Tag[]; accent: string }

const MODULES: Mod[] = [
  { to: '/fractals',     label: 'fractals',     code: '01', desc: 'mandelbrot · julia',              thumb: <ThumbMandelbrot />,   span: 'lg:col-span-2 lg:row-span-2', tags: ['visual', 'interactive'],          accent: '#6a8cff' },
  { to: '/attractors',   label: 'attractors',   code: '02', desc: 'lorenz · clifford · dejong',      thumb: <ThumbClifford />,                                           tags: ['visual', 'interactive'],          accent: '#b48cff' },
  { to: '/ascii',        label: 'ascii',        code: '03', desc: 'image → text',                    thumb: <ThumbAscii />,                                              tags: ['visual', 'interactive'],          accent: '#e8c878' },
  { to: '/terminal',     label: 'terminal',     code: '04', desc: 'rain · donut · life · flow · 30', thumb: <ThumbMatrix />,       span: 'lg:col-span-2',                tags: ['visual'],                         accent: '#40ff80' },
  { to: '/kaleidoscope', label: 'kaleidoscope', code: '07', desc: 'n-fold mirror',                   thumb: <ThumbKaleidoscope />,                                       tags: ['visual', 'meditative'],           accent: '#d46cff' },
  { to: '/pixels',       label: 'pixels',       code: '05', desc: 'fill game',                       thumb: <ThumbPixels />,                                             tags: ['game', 'interactive'],            accent: '#ff6a88' },
  { to: '/time',         label: 'time',         code: '06', desc: 'global clocks',                   thumb: <ThumbTime />,         span: 'lg:col-span-2',                tags: ['live'],                           accent: '#7ac4c4' },
  { to: '/sprites',      label: 'sprites',      code: '08', desc: 'ascii playground',                thumb: <ThumbSprites />,      span: 'lg:col-span-2',                tags: ['visual', 'interactive', 'meditative'], accent: '#ff8a5a' },
  { to: '/waves',        label: 'waves',        code: '09', desc: 'edm scope + sequencer',            thumb: <ThumbWaves />,        span: 'lg:col-span-2',                tags: ['audio', 'interactive'],           accent: '#50ffd8' },
  { to: '/doom',         label: 'doom',         code: '10', desc: 'e1m1 ascii homage',                thumb: <ThumbDoom />,         span: 'lg:col-span-2',                tags: ['game', 'interactive'],            accent: '#e04a1c' },
  { to: '/breathe',      label: 'breathe',      code: '11', desc: 'box-breathing guide',              thumb: <ThumbBreathe />,                                            tags: ['meditative'],                     accent: '#88ccff' },
  { to: '/starfield',    label: 'starfield',    code: '12', desc: '3d flythrough',                    thumb: <ThumbStarfield />,    span: 'lg:col-span-2',                tags: ['visual', 'interactive', 'meditative'], accent: '#c0b8ff' },
  { to: '/tarot',        label: 'tarot',        code: '13', desc: 'random draw',                      thumb: <ThumbTarot />,                                              tags: ['game', 'meditative'],             accent: '#e8c050' },
  { to: '/particles',    label: 'particles',    code: '14', desc: 'verlet physics',                   thumb: <ThumbParticles />,    span: 'lg:col-span-2',                tags: ['interactive', 'visual'],          accent: '#e09040' },
  { to: '/cyber',        label: 'cyber',        code: '15', desc: 'night city // v2.077',             thumb: <ThumbCyber />,        span: 'lg:col-span-2',                tags: ['visual'],                         accent: '#ff2db8' },
  { to: '/folds',        label: 'folds',        code: '16', desc: 'generative gallery',               thumb: <ThumbFolds />,        span: 'lg:col-span-2',                tags: ['visual'],                         accent: '#9ad08a' },
  { to: '/orbit',        label: 'orbit',        code: '17', desc: 'iss · live from 400km',            thumb: <ThumbOrbit />,        span: 'lg:col-span-2',                tags: ['live'],                           accent: '#6ab8ff' },
  { to: '/radio',        label: 'radio',        code: '18', desc: 'global stations · spin the globe', thumb: <ThumbRadio />,        span: 'lg:col-span-2',                tags: ['live', 'audio', 'interactive'],   accent: '#ffb86a' },
  { to: '/spinners',     label: 'spinners',     code: '19', desc: '54 terminal-style spinners',        thumb: <ThumbSpinners />,                                           tags: ['visual'],                         accent: '#d8d8d8' },
]

const TAGS: (Tag | 'all' | 'pinned')[] = ['all', 'pinned', 'visual', 'interactive', 'audio', 'meditative', 'live', 'game']

export default function Index() {
  const [now, setNow] = useState(new Date())
  const start = getSessionStart()
  const [tab, setTab] = useState<(typeof TAGS)[number]>('all')
  const [favs, setFavsState] = useState<string[]>(() => getFavs())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const visible = useMemo(() => {
    const filtered = MODULES.filter((m) => {
      if (tab === 'all') return true
      if (tab === 'pinned') return favs.includes(m.to)
      return m.tags.includes(tab as Tag)
    })
    // sort pinned first, but preserve original order within each bucket
    return [...filtered].sort((a, b) => {
      const af = favs.includes(a.to) ? 0 : 1
      const bf = favs.includes(b.to) ? 0 : 1
      return af - bf
    })
  }, [tab, favs])

  const onToggleFav = (path: string) => setFavsState(toggleFav(path))

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <span className="inline-block h-[26px] w-[14px] rounded-[3px] bg-[var(--color-fg)]" aria-hidden />
            <h1 className="text-[40px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">pirte</h1>
            <span className="text-[11px] tracking-[0.18em] text-[var(--color-dim)]">etrip · abstractions for the wandering mind</span>
          </div>
          <span className="text-[11px] tracking-[0.1em] text-[var(--color-dim)]">press ⌘k · jump · ? shortcuts · ⇧space wm</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-dim)] md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7">
          {CITIES.map((c) => (
            <div key={c.tz} className="flex items-center justify-between rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5">
              <span className="tracking-[0.12em]">{c.label}</span>
              <span className="tabular-nums text-[var(--color-fg)]">{formatTime(c.tz, now)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 xl:col-span-1">
            <span className="tracking-[0.12em]">session</span>
            <span className="tabular-nums text-[var(--color-fg)]">{formatElapsed(now.getTime() - start)}</span>
          </div>
        </div>

        {/* tag filter row */}
        <nav className="flex flex-wrap items-center gap-1 border-t border-[var(--color-line)] pt-3 text-[11px]">
          {TAGS.map((t) => {
            const count =
              t === 'all' ? MODULES.length :
              t === 'pinned' ? favs.length :
              MODULES.filter((m) => m.tags.includes(t as Tag)).length
            const active = t === tab
            const label = t === 'pinned' ? '★ pinned' : t
            return (
              <button
                key={t}
                data-interactive
                onClick={() => setTab(t)}
                className={`!px-3 !py-1 !text-[11px] ${active ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-[var(--color-line)] text-[var(--color-dim)]'}`}
              >
                {label} <span className="ml-1 text-[10px] text-[var(--color-dim)]">{count}</span>
              </button>
            )
          })}
        </nav>
      </header>

      <section className="grid auto-rows-[220px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {visible.map((m) => (
          <Tile
            key={m.to}
            to={m.to}
            label={m.label}
            code={m.code}
            className={m.span ?? ''}
            footer={<span>{m.desc}</span>}
            starred={favs.includes(m.to)}
            onToggleStar={() => onToggleFav(m.to)}
            accent={m.accent}
          >
            <div className="h-full w-full">{m.thumb}</div>
          </Tile>
        ))}
      </section>
      {visible.length === 0 && (
        <div className="grid place-items-center py-20 text-[var(--color-dim)]">
          <span>{tab === 'pinned' ? 'no pinned modules yet — hover any tile and click ☆' : `no modules tagged #${tab}`}</span>
        </div>
      )}
    </div>
  )
}
