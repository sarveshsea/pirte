import { useMemo, useState } from 'react'
import { SPINNERS, type SpinnerFamily } from '../components/spinners'

type Tab = 'all' | SpinnerFamily
const TABS: Tab[] = ['all', 'braille', 'ascii', 'arrow', 'emoji']

const SIZES = [14, 18, 24, 32, 48] as const

export default function Spinners() {
  const [tab, setTab] = useState<Tab>('all')
  const [size, setSize] = useState<number>(24)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SPINNERS.filter((s) => {
      if (tab !== 'all' && s.family !== tab) return false
      if (q && !s.id.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [tab, query])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: SPINNERS.length, braille: 0, ascii: 0, arrow: 0, emoji: 0 }
    for (const s of SPINNERS) c[s.family]++
    return c
  }, [])

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[28px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">spinners</h1>
            <span className="text-[13px] tracking-[0.18em] text-[var(--color-dim)]">
              54 terminal-style agent spinners · port of{' '}
              <a
                href="https://github.com/Eronred/expo-agent-spinners"
                target="_blank"
                rel="noreferrer"
                data-interactive
                className="underline decoration-[var(--color-line)] underline-offset-4 hover:decoration-[var(--color-fg)] hover:text-[var(--color-fg)]"
              >
                expo-agent-spinners
              </a>
            </span>
          </div>
          <span className="text-[13px] tracking-[0.1em] text-[var(--color-dim)]">text · timer · zero deps</span>
        </div>

        <nav className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3 text-[13px]">
          {TABS.map((t) => {
            const active = t === tab
            return (
              <button
                key={t}
                data-interactive
                onClick={() => setTab(t)}
                className={`!px-3 !py-1 !text-[13px] ${active ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-[var(--color-line)] text-[var(--color-dim)]'}`}
              >
                {t} <span className="ml-1 text-[12px] text-[var(--color-dim)]">{counts[t]}</span>
              </button>
            )
          })}

          <span className="mx-2 text-[var(--color-line)]">·</span>

          <span className="text-[var(--color-dim)] tracking-[0.12em]">size</span>
          {SIZES.map((s) => {
            const active = s === size
            return (
              <button
                key={s}
                data-interactive
                onClick={() => setSize(s)}
                className={`!px-2 !py-1 !text-[13px] tabular-nums ${active ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-[var(--color-line)] text-[var(--color-dim)]'}`}
              >
                {s}
              </button>
            )
          })}

          <span className="mx-2 text-[var(--color-line)]">·</span>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter…"
            className="ml-auto border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-dim)] outline-none focus:border-[var(--color-fg)]"
          />
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((s) => {
          const S = s.Component
          return (
            <div
              key={s.id}
              className="tile group relative flex min-h-[140px] flex-col items-center justify-between gap-3 p-4"
            >
              <span className="absolute left-2 top-2 text-[12px] tracking-[0.18em] text-[var(--color-dim)]">{s.family}</span>
              <span className="absolute right-2 top-2 text-[12px] tabular-nums text-[var(--color-line)]">{String(s.Component.interval)}ms</span>

              <div className="grid flex-1 place-items-center">
                <S size={size} color="var(--color-fg)" />
              </div>

              <div className="flex w-full items-center justify-between border-t border-[var(--color-line)] pt-2 text-[13px]">
                <span className="text-[var(--color-fg)]">{s.name}</span>
                <span className="tabular-nums text-[var(--color-dim)]">{s.Component.frames.length}f</span>
              </div>
            </div>
          )
        })}
      </section>

      {visible.length === 0 && (
        <div className="grid place-items-center py-20 text-[var(--color-dim)]">
          <span>no spinners match "{query}" in #{tab}</span>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-[var(--color-line)] pt-3 text-[13px] text-[var(--color-dim)]">
        <span>showing {visible.length} of {SPINNERS.length}</span>
        <span className="tracking-[0.1em]">54 spinners · mit license · <a href="https://github.com/Eronred/expo-agent-spinners" target="_blank" rel="noreferrer" data-interactive className="hover:text-[var(--color-fg)]">upstream</a></span>
      </footer>
    </div>
  )
}
