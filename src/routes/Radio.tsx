import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import {
  fetchStations, fetchTopCountries, fetchTopTags, registerClick,
  type Station, type CountryEntry, type TagEntry,
} from '../modules/radio/api'
import { buildIndex, glyphFor, nearestCell, project } from '../modules/radio/project'

const COLS = 120
const ROWS = 32
const VOLUME_KEY = 'pirte:radio:vol'
const LAST_UUID_KEY = 'pirte:radio:last'

type Status =
  | { kind: 'boot' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

export default function Radio() {
  const [status, setStatus] = useState<Status>({ kind: 'boot' })
  const [stations, setStations] = useState<Station[]>([])
  const [countries, setCountries] = useState<CountryEntry[]>([])
  const [tags, setTags] = useState<TagEntry[]>([])
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [country, setCountry] = useState(params.get('c') ?? '')
  const [tag, setTag] = useState(params.get('t') ?? '')
  const [currentId, setCurrentId] = useState<string | null>(params.get('uuid') ?? null)
  const [playing, setPlaying] = useState(false)
  const [streamErr, setStreamErr] = useState<string | null>(null)
  const [volume, setVolume] = useState<number>(() => {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.7
  })
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preRef = useRef<HTMLPreElement>(null)

  /* ---------------- initial fetch ---------------- */

  useEffect(() => {
    let cancelled = false
    setStatus({ kind: 'loading' })
    ;(async () => {
      try {
        const [st, co, tg] = await Promise.all([
          fetchStations({ limit: 600, order: 'clickcount' }),
          fetchTopCountries(30),
          fetchTopTags(40),
        ])
        if (cancelled) return
        setStations(st)
        setCountries(co)
        setTags(tg)
        setStatus({ kind: 'ready' })
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' })
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* ---------------- filtering ---------------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const c = country.trim().toLowerCase()
    const t = tag.trim().toLowerCase()
    return stations.filter((s) => {
      if (c && s.countrycode !== c) return false
      if (t && !s.tags.includes(t)) return false
      if (q) {
        if (!s.name.includes(q) && !s.country.includes(q) && !s.tags.some((x) => x.includes(q))) return false
      }
      return true
    })
  }, [stations, query, country, tag])

  const index = useMemo(() => buildIndex(filtered, COLS, ROWS), [filtered])

  /* ---------------- ascii map ---------------- */

  const mapText = useMemo(() => {
    const lines: string[] = []
    for (let y = 0; y < ROWS; y++) {
      let line = ''
      for (let x = 0; x < COLS; x++) {
        line += glyphFor(index.grid[y * COLS + x])
      }
      lines.push(line)
    }
    return lines.join('\n')
  }, [index])

  const current = useMemo(
    () => (currentId ? stations.find((s) => s.id === currentId) ?? null : null),
    [currentId, stations],
  )

  const currentCell = useMemo(() => {
    if (!current) return null
    const { x, y } = project(current.lat, current.lon, COLS, ROWS)
    return { x, y }
  }, [current])

  /* ---------------- audio ---------------- */

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = volume
    try { localStorage.setItem(VOLUME_KEY, String(volume)) } catch { /* ignore */ }
  }, [volume])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (!current) {
      a.pause()
      try { a.removeAttribute('src'); a.load() } catch { /* ignore */ }
      setPlaying(false)
      setStreamErr(null)
      return
    }
    setStreamErr(null)
    // defense-in-depth — toStation() upstream already filters to https,
    // but re-validate at the sink so a future upstream change can't leak
    // an http/file/javascript scheme into an <audio> src.
    try {
      if (new URL(current.url).protocol !== 'https:') {
        setStreamErr('blocked non-https stream')
        setPlaying(false)
        return
      }
    } catch {
      setStreamErr('invalid stream url')
      setPlaying(false)
      return
    }
    a.src = current.url
    a.play()
      .then(() => { setPlaying(true); registerClick(current.id).catch(() => {}) })
      .catch((e: unknown) => {
        setPlaying(false)
        const msg = e instanceof Error ? e.message : 'cannot play'
        setStreamErr(msg)
      })
    try { localStorage.setItem(LAST_UUID_KEY, current.id) } catch { /* ignore */ }
  }, [current?.id, current?.url])

  // url sync (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        if (currentId) p.set('uuid', currentId); else p.delete('uuid')
        if (query) p.set('q', query); else p.delete('q')
        if (country) p.set('c', country); else p.delete('c')
        if (tag) p.set('t', tag); else p.delete('t')
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [currentId, query, country, tag, setParams])

  /* ---------------- actions ---------------- */

  const playStation = useCallback((id: string) => {
    if (id === currentId) {
      const a = audioRef.current
      if (!a) return
      if (a.paused) a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      else { a.pause(); setPlaying(false) }
    } else {
      setCurrentId(id)
    }
  }, [currentId])

  const stop = useCallback(() => {
    setCurrentId(null); setPlaying(false)
  }, [])

  const shuffle = useCallback(() => {
    if (filtered.length === 0) return
    const pool = filtered.filter((s) => s.id !== currentId)
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? filtered[0]
    setCurrentId(pick.id)
  }, [filtered, currentId])

  const nextInFilter = useCallback(() => {
    if (filtered.length === 0) return
    const i = filtered.findIndex((s) => s.id === currentId)
    const next = filtered[(i + 1 + filtered.length) % filtered.length]
    setCurrentId(next.id)
  }, [filtered, currentId])

  const prevInFilter = useCallback(() => {
    if (filtered.length === 0) return
    const i = filtered.findIndex((s) => s.id === currentId)
    const prev = filtered[(i - 1 + filtered.length) % filtered.length]
    setCurrentId(prev.id)
  }, [filtered, currentId])

  /* ---------------- map pointer ---------------- */

  const getCellFromPointer = (e: React.PointerEvent<HTMLPreElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    // measure the char cell by reading the rendered size — the <pre> is flex-centered
    // in a fixed-height grid cell, so width/rows give us cw/ch
    const cw = rect.width / COLS
    const ch = rect.height / ROWS
    const col = Math.floor((e.clientX - rect.left) / cw)
    const row = Math.floor((e.clientY - rect.top) / ch)
    return { col, row }
  }

  const onMapMove = (e: React.PointerEvent<HTMLPreElement>) => {
    const { col, row } = getCellFromPointer(e)
    setHoverCell({ col, row })
  }
  const onMapLeave = () => setHoverCell(null)
  const onMapClick = (e: React.PointerEvent<HTMLPreElement>) => {
    const { col, row } = getCellFromPointer(e)
    const hit = nearestCell(index, col, row, 2)
    if (hit && hit.stations.length > 0) playStation(hit.stations[0].id)
  }

  const hoverStations = useMemo(() => {
    if (!hoverCell) return [] as Station[]
    const hit = nearestCell(index, hoverCell.col, hoverCell.row, 1)
    return hit ? hit.stations.slice(0, 4) : []
  }, [hoverCell, index])

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') {
        e.preventDefault()
        if (current) playStation(current.id)
        else if (filtered[0]) playStation(filtered[0].id)
        return
      }
      const k = e.key.toLowerCase()
      if (k === 's') shuffle()
      else if (k === 'n' || e.key === 'ArrowRight') nextInFilter()
      else if (k === 'p' || e.key === 'ArrowLeft') prevInFilter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, filtered, playStation, shuffle, nextInFilter, prevInFilter])

  /* ---------------- render ---------------- */

  const totalStations = stations.length
  const countInFilter = filtered.length

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setStreamErr('stream error') }}
      />

      <Tile
        label={current ? `radio · ${current.name}` : 'radio · click a pin'}
        code="world"
        footer={
          <div className="flex items-center justify-between">
            <span>
              {status.kind === 'loading' && 'fetching world radio…'}
              {status.kind === 'error'   && `api err · ${status.message}`}
              {status.kind === 'ready'   && (
                current
                  ? `${current.country} · ${current.tags[0] ?? 'radio'} · ${current.codec || 'stream'} ${current.bitrate || '?'}kbps`
                  : `${countInFilter}/${totalStations} stations · click any cell · space play/pause · s shuffle`
              )}
              {streamErr && ` · ${streamErr}`}
            </span>
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${playing ? 'bg-[#ff4b5e]' : 'bg-[var(--color-dim)]'}`}
                style={playing ? { boxShadow: '0 0 8px #ff4b5e' } : undefined}
              />
              <span className="tracking-[0.12em]">{playing ? 'live' : 'idle'}</span>
            </span>
          </div>
        }
      >
        <div className="relative h-[60vh] w-full">
          {status.kind !== 'ready' ? (
            <div className="grid h-full place-items-center text-[13px] tracking-[0.18em] text-[var(--color-dim)]">
              {status.kind === 'error' ? `unable to reach radio-browser — ${status.message}` : 'fetching world radio…'}
            </div>
          ) : (
            <>
              <pre
                ref={preRef}
                onPointerMove={onMapMove}
                onPointerLeave={onMapLeave}
                onClick={onMapClick}
                className="m-0 h-full w-full whitespace-pre p-3 text-[12px] leading-[1.0] text-[var(--color-dim)]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {mapText}
              </pre>

              {/* current-station highlight */}
              {currentCell && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute text-[12px] leading-[1.0]"
                  style={{
                    left: `calc(${(currentCell.x / COLS) * 100}% + 12px)`,
                    top: `calc(${(currentCell.y / ROWS) * 100}% + 12px)`,
                    color: '#ff4b5e',
                    textShadow: '0 0 8px #ff4b5e',
                  }}
                >◉</span>
              )}

              {/* hover tooltip */}
              {hoverCell && hoverStations.length > 0 && (
                <div
                  className="pointer-events-none absolute rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-2 py-1.5 text-[13px] backdrop-blur-md"
                  style={{
                    left: `calc(${(hoverCell.col / COLS) * 100}% + 24px)`,
                    top: `calc(${(hoverCell.row / ROWS) * 100}% + 4px)`,
                    maxWidth: 280,
                  }}
                >
                  {hoverStations.map((s) => (
                    <div key={s.id} className="truncate">
                      <span className="text-[var(--color-fg)]">{s.name}</span>
                      <span className="ml-1 text-[var(--color-dim)]">· {s.country}</span>
                    </div>
                  ))}
                  {hoverStations.length < (nearestCell(index, hoverCell.col, hoverCell.row, 1)?.stations.length ?? 0) && (
                    <div className="text-[12px] text-[var(--color-dim)]">+ more…</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Tile>

      {/* sidebar */}
      <div className="flex flex-col gap-4">
        <Tile label="now playing" code={current ? current.countrycode : '—'}>
          <div className="flex flex-col gap-3 p-3 text-[12px]">
            {current ? (
              <>
                <div>
                  <div className="text-[var(--color-fg)]">{current.name}</div>
                  <div className="text-[var(--color-dim)]">{current.country} · {current.language || 'n/a'}</div>
                </div>
                <div className="flex flex-wrap gap-1 text-[12px]">
                  {current.tags.slice(0, 4).map((t) => (
                    <span key={t} className="rounded-[4px] border border-[var(--color-line)] px-1.5 py-0.5 text-[var(--color-dim)]">{t}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[13px] text-[var(--color-dim)]">
                  <span>{current.codec || 'stream'}{current.bitrate ? ` · ${current.bitrate}kbps` : ''}</span>
                  <span>{current.votes} ★ · {current.clickcount} plays</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button data-interactive onClick={() => playStation(current.id)}>{playing ? '■ pause' : '▶ play'}</button>
                  <button data-interactive onClick={prevInFilter}>‹ prev</button>
                  <button data-interactive onClick={nextInFilter}>next ›</button>
                  <button data-interactive onClick={stop} className="ml-auto">stop</button>
                </div>
              </>
            ) : (
              <div className="text-[var(--color-dim)]">pick a station · space plays the first match</div>
            )}
            <Slider label="volume" min={0} max={1} step={0.01} value={volume} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </Tile>

        <Tile label="filter">
          <div className="flex flex-col gap-2 p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search name / country / tag…"
              className="w-full rounded-[6px] border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-dim)]"
            />
            <div className="mt-1 text-[12px] tracking-[0.15em] text-[var(--color-dim)]">country</div>
            <div className="flex flex-wrap gap-1">
              <Chip label="any" active={!country} onClick={() => setCountry('')} />
              {countries.slice(0, 12).map((c) => (
                <Chip
                  key={c.iso_3166_1}
                  label={`${c.iso_3166_1} ${c.stationcount}`}
                  active={country === c.iso_3166_1}
                  onClick={() => setCountry(country === c.iso_3166_1 ? '' : c.iso_3166_1)}
                />
              ))}
            </div>
            <div className="mt-2 text-[12px] tracking-[0.15em] text-[var(--color-dim)]">genre</div>
            <div className="flex flex-wrap gap-1">
              <Chip label="any" active={!tag} onClick={() => setTag('')} />
              {tags.slice(0, 14).map((t) => (
                <Chip
                  key={t.name}
                  label={t.name}
                  active={tag === t.name}
                  onClick={() => setTag(tag === t.name ? '' : t.name)}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button data-interactive onClick={shuffle}>↯ shuffle</button>
              {(query || country || tag) && (
                <button data-interactive onClick={() => { setQuery(''); setCountry(''); setTag('') }}>clear</button>
              )}
            </div>
          </div>
        </Tile>

        <Tile label={`stations · ${countInFilter}`} code={status.kind === 'loading' ? 'loading' : 'live'}>
          <div className="max-h-[40vh] overflow-auto p-2">
            {filtered.slice(0, 100).map((s) => {
              const active = s.id === currentId
              return (
                <button
                  key={s.id}
                  data-interactive
                  onClick={() => playStation(s.id)}
                  className={`flex w-full items-baseline justify-between gap-2 !rounded-[4px] !border-0 !px-2 !py-1 text-left text-[12px] ${active ? 'bg-[var(--color-line)] text-[var(--color-fg)]' : 'text-[var(--color-dim)] hover:bg-[var(--color-line)]/60'}`}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-[12px] uppercase tracking-[0.1em]">{s.countrycode || '—'}</span>
                    <span className="truncate text-[var(--color-fg)]">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--color-dim)]">
                    {s.bitrate ? `${s.bitrate}` : s.codec || ''}
                  </span>
                </button>
              )
            })}
            {countInFilter === 0 && status.kind === 'ready' && (
              <div className="p-3 text-[13px] text-[var(--color-dim)]">no stations match · clear the filter</div>
            )}
          </div>
        </Tile>
      </div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      data-interactive
      onClick={onClick}
      className={`!rounded-[999px] !border !px-2 !py-0.5 text-[12px] ${active ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : '!border-[var(--color-line)] text-[var(--color-dim)]'}`}
    >
      {label}
    </button>
  )
}
