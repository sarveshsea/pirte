import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { STATIONS, resolveStreamUrl, type Station } from '../data/stations'

/* radio — global stations on an ascii world map, inspired by radio.garden */

const WORLD: string[] = [
  '        .::---:..                                                 .:---::.             ',
  '   ..::==++**###*=:.       .:-=+++=-:..            ..::-=+**##**+==+**#####*=:.        ',
  ' .-=+*######*#####**+=-:-=+*######*#####+-.     .:=**#########*######*########*=-.     ',
  '.=*##################*#################*##-:::-+*##################################+:. ',
  ':*####################################*###******####################################*-',
  ':+####################################################################################+',
  ' =####################################################################################*',
  ' .*##################################################################################*.',
  '  :*##*###########################################*################################*- ',
  '   :+*############################################################################*:   ',
  '    .-=**######################################################################*=-     ',
  '       .:-==+**##########################################################**+=:.        ',
  '            ..::--==++**############################################*+==:.             ',
  '                     ..::---===++++*******++++===---:::..                               ',
]

const ROWS = WORLD.length
const COLS = WORLD[0].length

function latLonToCell(lat: number, lon: number) {
  const x = Math.floor(((lon + 180) / 360) * COLS)
  const y = Math.floor(((90 - lat) / 180) * ROWS)
  return { x: Math.max(0, Math.min(COLS - 1, x)), y: Math.max(0, Math.min(ROWS - 1, y)) }
}

function WorldMap({ stations, currentId, onPick }: { stations: Station[]; currentId: string | null; onPick: (id: string) => void }) {
  // render as a grid of spans so we can make cells clickable
  const grid = useMemo(() => {
    const arr = WORLD.map((r) => r.split(''))
    const marks: { x: number; y: number; id: string; current: boolean }[] = []
    stations.forEach((s) => {
      const { x, y } = latLonToCell(s.lat, s.lon)
      marks.push({ x, y, id: s.id, current: s.id === currentId })
      arr[y][x] = s.id === currentId ? '◉' : '•'
    })
    return { arr, marks }
  }, [stations, currentId])

  return (
    <pre className="m-0 whitespace-pre p-4 text-[10px] leading-[1.1] text-[var(--color-fg)]">
      {grid.arr.map((row, y) => (
        <div key={y} className="flex">
          {row.map((ch, x) => {
            const mark = grid.marks.find((m) => m.x === x && m.y === y)
            if (!mark) return <span key={x}>{ch}</span>
            return (
              <button
                key={x}
                data-interactive
                onClick={() => onPick(mark.id)}
                title={stations.find((s) => s.id === mark.id)?.name}
                className={`!border-0 !p-0 !leading-[1.1] !text-[10px] ${mark.current ? '!text-[#ff4b5e]' : '!text-[var(--color-fg)]'} hover:!text-[#ff4b5e]`}
                style={{ background: 'transparent' }}
              >
                {ch}
              </button>
            )
          })}
        </div>
      ))}
    </pre>
  )
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export default function Radio() {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.75)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const current = useMemo<Station | null>(() => {
    if (customUrl && currentId === '__custom') {
      return { id: '__custom', city: 'custom', country: '', cc: '··', lat: 0, lon: 0, name: 'custom stream', genre: 'custom', url: customUrl }
    }
    return STATIONS.find((s) => s.id === currentId) ?? null
  }, [currentId, customUrl])

  // elapsed tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // stream change
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (!current) { a.pause(); a.removeAttribute('src'); a.load(); setPlaying(false); return }
    a.src = current.url
    a.volume = volume
    a.play().then(() => {
      setPlaying(true)
      setStartedAt(Date.now())
      setErr(null)
    }).catch((e: unknown) => {
      setPlaying(false)
      setErr(e instanceof Error ? e.message : 'cannot play')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.url])

  const onPick = (id: string) => {
    if (id === currentId) {
      // toggle
      const a = audioRef.current
      if (!a) return
      if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
      return
    }
    setCurrentId(id)
  }

  const onToggle = () => {
    const a = audioRef.current
    if (!a || !current) return
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
    else { a.pause(); setPlaying(false) }
  }

  const onCustomGo = () => {
    const url = resolveStreamUrl(custom)
    if (!url) { setErr('cannot parse url'); return }
    setCustomUrl(url)
    setCurrentId('__custom')
  }

  const elapsed = startedAt && playing ? now - startedAt : 0

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <audio ref={audioRef} crossOrigin="anonymous" preload="none" onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setErr('stream error') }} />

      {/* left — now playing + map */}
      <div className="flex flex-col gap-6">
        <Tile
          label={current ? `now playing · ${current.cc}` : 'radio · pick a station'}
          code="tune"
          footer={
            <div className="flex items-center justify-between">
              <span>{err ? `err · ${err}` : current ? `${current.city}${current.country ? ', ' + current.country : ''} · ${current.genre}` : 'click any pin on the map or a station below'}</span>
              <span className="tabular-nums">{fmtElapsed(elapsed)}</span>
            </div>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] tracking-[0.18em] text-[var(--color-dim)]">{current ? current.name : 'stream · idle'}</span>
                <span className="text-[28px] leading-none tracking-[-0.02em] text-[var(--color-fg)]">
                  {current ? current.city : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${playing ? 'bg-[#ff4b5e]' : 'bg-[var(--color-dim)]'}`} style={playing ? { boxShadow: '0 0 8px #ff4b5e' } : undefined} />
                <span className="text-[11px] tracking-[0.12em] text-[var(--color-dim)]">{playing ? 'live' : 'idle'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                data-interactive
                onClick={onToggle}
                disabled={!current}
                className="!px-3 !py-1 text-[11px]"
              >
                {playing ? '⏸ pause' : '▶ play'}
              </button>
              <label className="flex items-center gap-2 text-[11px] text-[var(--color-dim)]">
                <span>vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-[2px] w-32 accent-[var(--color-fg)]"
                />
                <span className="tabular-nums text-[var(--color-fg)]">{Math.round(volume * 100)}</span>
              </label>
            </div>
          </div>
        </Tile>

        <Tile label="world" code="map" footer={<span>click a pin to tune · red = playing · equirectangular projection</span>}>
          <WorldMap stations={STATIONS} currentId={currentId} onPick={onPick} />
        </Tile>
      </div>

      {/* right — stations + custom + about */}
      <div className="flex flex-col gap-6">
        <Tile label="stations" code={String(STATIONS.length).padStart(2, '0')} footer={<span>curated · all https · browser-playable</span>}>
          <ul className="flex max-h-[420px] flex-col overflow-auto">
            {STATIONS.map((s) => {
              const active = s.id === currentId
              return (
                <li key={s.id}>
                  <button
                    data-interactive
                    onClick={() => onPick(s.id)}
                    className={`flex w-full items-center justify-between !border-0 !border-b !border-[var(--color-line)] !px-4 !py-2 text-left text-[12px] ${active ? '!text-[var(--color-fg)] bg-[var(--color-surface)]' : '!text-[var(--color-dim)]'} hover:!text-[var(--color-fg)]`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-6 text-[10px] tracking-[0.12em] text-[var(--color-dim)]">{s.cc}</span>
                      <span className="flex flex-col">
                        <span className={active ? 'text-[var(--color-fg)]' : ''}>{s.name}</span>
                        <span className="text-[10px] tracking-[0.08em] text-[var(--color-dim)]">{s.city} · {s.genre}</span>
                      </span>
                    </span>
                    {active && <span className={`ml-2 inline-block h-2 w-2 rounded-full ${playing ? 'bg-[#ff4b5e]' : 'bg-[var(--color-dim)]'}`} style={playing ? { boxShadow: '0 0 6px #ff4b5e' } : undefined} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Tile>

        <Tile label="custom stream" code="url" footer={<span>paste a radio.garden link or any direct stream url</span>}>
          <div className="flex flex-col gap-2 p-4 text-[12px]">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCustomGo() }}
              placeholder="radio.garden/visit/fermont/GgID8aJ9"
              className="w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] text-[var(--color-fg)] outline-none focus:border-[var(--color-fg)]"
            />
            <div className="flex items-center justify-between">
              <button data-interactive onClick={onCustomGo} className="!px-3 !py-1 text-[11px]">tune</button>
              <span className="text-[10px] text-[var(--color-dim)]">{customUrl ? 'resolved · playing' : 'not set'}</span>
            </div>
          </div>
        </Tile>

        <Tile label="about" footer={<span>not affiliated with radio.garden</span>}>
          <div className="flex flex-col gap-2 p-4 text-[12px] text-[var(--color-dim)]">
            <p className="text-[var(--color-fg)]">spin the globe. land somewhere you've never been.</p>
            <p>stations are streamed directly from each broadcaster's public endpoint — no proxy, no analytics.</p>
            <p>if a stream stalls it's usually the broadcaster's end. try another and come back.</p>
          </div>
        </Tile>
      </div>
    </div>
  )
}
