import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'
import { STATIONS, type Station } from '../data/stations'

/* radio — purely a world map. click a pin to tune. */

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

export default function Radio() {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const current = useMemo<Station | null>(
    () => STATIONS.find((s) => s.id === currentId) ?? null,
    [currentId],
  )

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (!current) { a.pause(); a.removeAttribute('src'); a.load(); setPlaying(false); return }
    a.src = current.url
    a.play().then(() => { setPlaying(true); setErr(null) })
      .catch((e: unknown) => { setPlaying(false); setErr(e instanceof Error ? e.message : 'cannot play') })
  }, [current?.id, current?.url])

  const pick = (id: string) => {
    if (id !== currentId) { setCurrentId(id); return }
    const a = audioRef.current; if (!a) return
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
    else { a.pause(); setPlaying(false) }
  }

  const grid = useMemo(() => {
    const arr = WORLD.map((r) => r.split(''))
    const marks: { x: number; y: number; id: string; current: boolean }[] = []
    STATIONS.forEach((s) => {
      const { x, y } = latLonToCell(s.lat, s.lon)
      marks.push({ x, y, id: s.id, current: s.id === currentId })
      arr[y][x] = s.id === currentId ? '◉' : '•'
    })
    return { arr, marks }
  }, [currentId])

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setErr('stream error') }}
      />

      <Tile
        label={current ? `${current.cc} · ${current.city} · ${current.name}` : 'radio · click a pin'}
        code="world"
        footer={
          <div className="flex items-center justify-between">
            <span>
              {err ? `err · ${err}`
                : current ? `${current.genre} · ${playing ? 'live' : 'paused'} · click same pin to toggle`
                : `${STATIONS.length} stations · click to tune`}
            </span>
            <span className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${playing ? 'bg-[#ff4b5e]' : 'bg-[var(--color-dim)]'}`} style={playing ? { boxShadow: '0 0 8px #ff4b5e' } : undefined} />
              <span className="tracking-[0.12em]">{playing ? 'live' : 'idle'}</span>
            </span>
          </div>
        }
      >
        <div className="grid h-full w-full place-items-center overflow-auto p-4">
          <pre className="m-0 whitespace-pre text-[12px] leading-[1.15] text-[var(--color-fg)]">
            {grid.arr.map((row, y) => (
              <div key={y} className="flex">
                {row.map((ch, x) => {
                  const mark = grid.marks.find((m) => m.x === x && m.y === y)
                  if (!mark) return <span key={x}>{ch}</span>
                  const s = STATIONS.find((st) => st.id === mark.id)!
                  return (
                    <button
                      key={x}
                      data-interactive
                      onClick={() => pick(mark.id)}
                      title={`${s.city} · ${s.name}`}
                      className={`!border-0 !p-0 !leading-[1.15] !text-[12px] ${mark.current ? '!text-[#ff4b5e]' : '!text-[var(--color-fg)]'} hover:!text-[#ff4b5e]`}
                      style={{ background: 'transparent' }}
                    >
                      {ch}
                    </button>
                  )
                })}
              </div>
            ))}
          </pre>
        </div>
      </Tile>
    </>
  )
}
