import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { rafLoop } from '../lib/rafLoop'
import { prefersReducedMotion } from '../lib/canvas'
import { subscribeWikiStream, type StreamStatus } from '../modules/edits/stream'
import { EditStats, renderSparkline, type StatsSnapshot } from '../modules/edits/stats'
import type { EditRow } from '../modules/edits/types'

/* edits · live
   server-sent firehose of every wikipedia/wikidata/commons edit happening
   on earth, right now. ~30–100 events/second. every row is one human (or
   bot) touching one article. ticker on the left, derived stats on the right. */

const MAX_DISPLAY = 32        // oldest rows slide off the end of the ticker
const STATS_REFRESH_MS = 250  // ~4hz — smooth enough, cheap enough

export default function Edits() {
  const [rows, setRows] = useState<EditRow[]>([])
  const [stats, setStats] = useState<StatsSnapshot>(() => EMPTY_STATS)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [paused, setPaused] = useState(false)

  const rowsRef = useRef<EditRow[]>([])
  const pendingRef = useRef<EditRow[]>([])
  const statsObj = useRef(new EditStats())
  const pausedRef = useRef(false); pausedRef.current = paused
  const lastFlush = useRef(0)

  // subscribe to the stream — stats always accumulate; ui ticker pauses on demand
  useEffect(() => {
    const sub = subscribeWikiStream({
      onRow: (row) => {
        statsObj.current.add({ ts: row.ts, wiki: row.wiki, lang: row.lang, bot: row.bot })
        if (!pausedRef.current) pendingRef.current.push(row)
      },
      onStatus: setStatus,
    })
    return () => sub.close()
  }, [])

  // rAF-throttled flush — accumulated events drain into state ~once per frame
  // but we only re-render rows / stats when something actually changed.
  useEffect(() => {
    if (prefersReducedMotion()) return
    return rafLoop((t) => {
      if (pendingRef.current.length > 0) {
        const next = pendingRef.current.splice(0).concat(rowsRef.current)
        if (next.length > MAX_DISPLAY) next.length = MAX_DISPLAY
        rowsRef.current = next
        setRows(next)
      }
      if (t - lastFlush.current >= STATS_REFRESH_MS) {
        lastFlush.current = t
        setStats(statsObj.current.snapshot())
      }
    })
  }, [])

  const sparkText = useMemo(() => renderSparkline(stats.sparkline), [stats.sparkline])
  const now = Date.now()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      {/* live ticker */}
      <Tile
        label={`edits · live · wikipedia`}
        code="23"
        footer={
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${statusDot(status)}`} style={statusGlow(status)} />
              {status}
              <span className="mx-2 text-[var(--color-line)]">·</span>
              {rows.length} shown · {stats.editsLastMin} in last 60s
            </span>
            <span>
              <button
                data-interactive
                onClick={() => setPaused((v) => !v)}
                className="!px-2 !py-0.5 !text-[12px]"
                title="space · pause the ticker (stats keep accumulating)"
              >
                {paused ? 'resume' : 'pause'}
              </button>
            </span>
          </div>
        }
      >
        <div className="h-[68vh] overflow-hidden px-4 py-3">
          <pre className="m-0 flex h-full flex-col gap-[1px] whitespace-pre font-mono text-[12px] leading-[1.35]">
            {rows.length === 0 ? (
              <span className="text-[var(--color-dim)]">
                {status === 'live' ? 'waiting for the first edit…' : 'connecting to stream.wikimedia.org…'}
              </span>
            ) : rows.map((r, i) => {
              // fade older rows so the ticker feels depth-of-field, not a hard cliff
              const age = (now - r.ts) / 1000
              const opacity = Math.max(0.18, 1 - (i / rows.length) * 0.82)
              return (
                <RowLine key={r.id} row={r} opacity={opacity} ageSec={age} />
              )
            })}
          </pre>
        </div>
      </Tile>

      {/* stats column */}
      <div className="flex flex-col gap-6">
        <Tile label="rate" code="e/s" footer={<span>10s rolling window</span>}>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-[42px] leading-none tabular-nums text-[var(--color-fg)]">
                {stats.editsPerSec.toFixed(1)}
              </span>
              <span className="text-[13px] tracking-[0.1em] text-[var(--color-dim)]">edits / sec</span>
            </div>
            <pre className="m-0 whitespace-pre font-mono text-[12px] leading-[1] text-[var(--color-fg)]">
              {sparkText}
            </pre>
            <div className="text-[13px] tracking-[0.08em] text-[var(--color-dim)]">
              60s sparkline · bin = 1s
            </div>
          </div>
        </Tile>

        <Tile label="bot vs human" code="60s">
          <div className="flex flex-col gap-2 p-4">
            <BotBar ratio={stats.botRatio} total={stats.editsLastMin} />
          </div>
        </Tile>

        <Tile label="top languages" code="60s">
          <div className="flex flex-col p-0">
            {stats.topLangs.length === 0 && (
              <div className="px-4 py-3 text-[var(--color-dim)] text-[12px]">no data yet</div>
            )}
            {stats.topLangs.map((l) => (
              <LangRow key={l.lang} lang={l.lang} count={l.count} max={stats.topLangs[0]?.count ?? 1} />
            ))}
          </div>
        </Tile>

        <Tile label="top wikis" code="60s">
          <div className="flex flex-col p-0">
            {stats.topWikis.length === 0 && (
              <div className="px-4 py-3 text-[var(--color-dim)] text-[12px]">no data yet</div>
            )}
            {stats.topWikis.map((w) => (
              <LangRow key={w.wiki} lang={w.wiki} count={w.count} max={stats.topWikis[0]?.count ?? 1} />
            ))}
          </div>
        </Tile>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RowLine({ row, opacity, ageSec }: { row: EditRow; opacity: number; ageSec: number }) {
  const hhmmss = formatTs(row.ts)
  const userColor = row.bot ? 'text-[var(--color-dim)]' : 'text-[var(--color-fg)]'
  const titleColor = row.kind === 'new' ? 'text-[#a8dcff]' : 'text-[var(--color-fg)]'
  const kindMark = row.kind === 'new' ? '+' : row.kind === 'log' ? '·' : '→'
  const delta = row.delta === 0 ? '' : (row.delta > 0 ? `+${row.delta}` : `${row.delta}`)
  return (
    <span
      style={{ opacity }}
      className="flex items-baseline gap-2 whitespace-nowrap overflow-hidden"
      title={`${row.wiki} · ${ageSec.toFixed(1)}s ago`}
    >
      <span className="tabular-nums text-[var(--color-line)]">{hhmmss}</span>
      <span className="min-w-[20px] tabular-nums text-[var(--color-dim)]">{row.lang}</span>
      <span className={`truncate max-w-[180px] ${userColor}`}>{row.user}</span>
      <span className="text-[var(--color-line)]">{kindMark}</span>
      <span className={`truncate flex-1 ${titleColor}`}>{row.title}</span>
      {delta && (
        <span className={`tabular-nums ${row.delta > 0 ? 'text-[#9ee3a0]' : 'text-[#ff9a8a]'}`}>
          {delta}
        </span>
      )}
    </span>
  )
}

function BotBar({ ratio, total }: { ratio: number; total: number }) {
  const botPct = (ratio * 100).toFixed(0)
  const humanPct = (100 - ratio * 100).toFixed(0)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full overflow-hidden rounded-[3px] border border-[var(--color-line)]">
        <span
          style={{ width: `${(1 - ratio) * 100}%` }}
          className="bg-[var(--color-fg)]"
          aria-label={`human ${humanPct}%`}
        />
        <span
          style={{ width: `${ratio * 100}%` }}
          className="bg-[var(--color-dim)]"
          aria-label={`bot ${botPct}%`}
        />
      </div>
      <div className="flex justify-between text-[12px]">
        <span className="text-[var(--color-fg)]">human {humanPct}%</span>
        <span className="text-[var(--color-dim)]">bot {botPct}%</span>
      </div>
      <div className="text-[13px] tracking-[0.08em] text-[var(--color-dim)]">
        {total} events · last 60s
      </div>
    </div>
  )
}

function LangRow({ lang, count, max }: { lang: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-1.5 last:border-0">
      <span className="w-[72px] truncate tracking-[0.08em] text-[var(--color-dim)] text-[12px]">{lang}</span>
      <span className="flex-1 h-1.5 overflow-hidden rounded-[1px] bg-[var(--color-line)]">
        <span style={{ width: `${pct}%` }} className="block h-full bg-[var(--color-fg)]" />
      </span>
      <span className="w-[40px] text-right tabular-nums text-[var(--color-fg)] text-[12px]">{count}</span>
    </div>
  )
}

function formatTs(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function statusDot(s: StreamStatus): string {
  return s === 'live' ? 'bg-[#9ee3a0]' : s === 'connecting' ? 'bg-[#ffcf6a]' : 'bg-[#ff7a7a]'
}

function statusGlow(s: StreamStatus): React.CSSProperties {
  const color = s === 'live' ? '#9ee3a0' : s === 'connecting' ? '#ffcf6a' : '#ff7a7a'
  return { boxShadow: `0 0 8px ${color}` }
}

const EMPTY_STATS: StatsSnapshot = {
  editsPerSec: 0,
  editsLastMin: 0,
  botRatio: 0,
  topWikis: [],
  topLangs: [],
  sparkline: new Array(60).fill(0),
}
