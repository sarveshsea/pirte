import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '../components/Tile'

/* iss live viewer — youtube embeds + wheretheiss.at telemetry + mission clock */

type ISSData = {
  latitude: number
  longitude: number
  altitude: number       // km
  velocity: number       // km/h
  visibility: 'daylight' | 'eclipsed'
  timestamp: number
}

const STREAMS = [
  { id: 'H999s0lxddA',  label: 'nasa earth',    hint: 'nasa · 24/7 earth from iss' },
  { id: '21X5lGlDOfg',  label: 'nasa hd',       hint: 'nasa · legacy hd feed' },
  { id: 'xRPjKQtRXR8',  label: 'nasa tv',       hint: 'nasa · public channel' },
] as const

const ISS_CONTINUOUS_START = new Date('2000-11-02T09:21:00Z').getTime()

function useISS(pollMs = 4000) {
  const [data, setData] = useState<ISSData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { cache: 'no-store' })
        if (!res.ok) throw new Error(`http ${res.status}`)
        const j = await res.json()
        if (cancelled) return
        setData({
          latitude: j.latitude,
          longitude: j.longitude,
          altitude: j.altitude,
          velocity: j.velocity,
          visibility: j.visibility,
          timestamp: j.timestamp,
        })
        setErr(null)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'unknown')
      }
    }
    load()
    const id = setInterval(load, pollMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [pollMs])
  return { data, err }
}

/* ascii world map with iss position marker */

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

function latLonToChar(lat: number, lon: number, cols: number, rows: number) {
  // lon: -180..180 → 0..cols; lat: 90..-90 → 0..rows
  const x = Math.floor(((lon + 180) / 360) * cols)
  const y = Math.floor(((90 - lat) / 180) * rows)
  return { x, y }
}

function WorldMap({ iss }: { iss: ISSData | null }) {
  const lines = useMemo(() => {
    const rows = WORLD.length
    const cols = WORLD[0].length
    const arr = WORLD.map((r) => r.split(''))
    if (iss) {
      const { x, y } = latLonToChar(iss.latitude, iss.longitude, cols, rows)
      if (y >= 0 && y < rows && x >= 0 && x < cols) {
        // plot a small cross at ISS position
        arr[y][x] = '◉'
        if (y - 1 >= 0) arr[y - 1][x] = '│'
        if (y + 1 < rows) arr[y + 1][x] = '│'
        if (x - 1 >= 0) arr[y][x - 1] = '─'
        if (x + 1 < cols) arr[y][x + 1] = '─'
      }
    }
    return arr.map((r) => r.join('')).join('\n')
  }, [iss?.latitude, iss?.longitude])
  return (
    <pre className="m-0 whitespace-pre p-4 text-[12px] leading-[1.1] text-[var(--color-fg)]">
      {lines}
    </pre>
  )
}

/* mission clock — days since continuous human presence on iss */

function MissionClock() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = now - ISS_CONTINUOUS_START
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms / 3600000) % 24)
  const mins = Math.floor((ms / 60000) % 60)
  const secs = Math.floor((ms / 1000) % 60)
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-[13px] tracking-[0.12em] text-[var(--color-dim)]">continuous human presence</div>
      <div className="flex items-baseline gap-3 tabular-nums text-[var(--color-fg)]">
        <span className="text-[42px] leading-none">{days.toLocaleString()}</span>
        <span className="text-[13px] tracking-[0.1em] text-[var(--color-dim)]">days</span>
      </div>
      <div className="tabular-nums text-[var(--color-dim)]">
        {String(hours).padStart(2, '0')}h {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
      </div>
      <div className="mt-2 border-t border-[var(--color-line)] pt-3 text-[13px] text-[var(--color-dim)]">
        since <span className="text-[var(--color-fg)]">nov 02, 2000 · 09:21 utc</span>
      </div>
      <div className="text-[13px] text-[var(--color-dim)]">expedition 1 · krikalev, shepherd, gidzenko</div>
    </div>
  )
}

export default function Orbit() {
  const [streamIdx, setStreamIdx] = useState(0)
  const stream = STREAMS[streamIdx]
  const { data: iss, err } = useISS(4000)
  const wrapRef = useRef<HTMLDivElement>(null)

  // trail of past positions
  const trailRef = useRef<{ lat: number; lon: number }[]>([])
  useEffect(() => {
    if (!iss) return
    trailRef.current.push({ lat: iss.latitude, lon: iss.longitude })
    if (trailRef.current.length > 120) trailRef.current.shift()
  }, [iss?.timestamp])

  // cute last-update clock
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const sinceUpdate = iss ? Math.floor((Date.now() / 1000 - iss.timestamp)) : 0

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]" ref={wrapRef}>
      {/* left column — live video */}
      <div className="flex flex-col gap-6">
        <Tile
          label="orbit · live · iss"
          code="17"
          footer={
            <div className="flex items-center justify-between">
              <span>{stream.hint}</span>
              <span>
                stream ·{' '}
                {STREAMS.map((s, i) => (
                  <button
                    key={s.id}
                    data-interactive
                    onClick={() => setStreamIdx(i)}
                    className={`ml-1 !px-2 !py-0.5 text-[13px] ${i === streamIdx ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </div>
          }
        >
          <div className="relative aspect-video w-full bg-black">
            <iframe
              key={stream.id}
              src={`https://www.youtube-nocookie.com/embed/${stream.id}?autoplay=1&mute=1&modestbranding=1&rel=0&iv_load_policy=3&controls=1`}
              title={`iss live · ${stream.label}`}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            {/* corner reticles */}
            <span aria-hidden className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-[var(--color-fg)]/60" />
            <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-[var(--color-fg)]/60" />
            <span aria-hidden className="pointer-events-none absolute left-2 bottom-2 h-3 w-3 border-l border-b border-[var(--color-fg)]/60" />
            <span aria-hidden className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-[var(--color-fg)]/60" />
            <div aria-hidden className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 text-[13px] text-[var(--color-fg)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#ff4b5e]" style={{ boxShadow: '0 0 8px #ff4b5e' }} />
              <span className="tracking-[0.12em]">live · iss</span>
            </div>
          </div>
        </Tile>

        {/* ascii ground track */}
        <Tile label="ground track" code="map" footer={<span>marker = current position · flat equirectangular projection</span>}>
          <WorldMap iss={iss} />
        </Tile>
      </div>

      {/* right column — telemetry + mission clock */}
      <div className="flex flex-col gap-6">
        <Tile label="telemetry" code="25544" footer={<span>{err ? `api err · ${err}` : `updated ${sinceUpdate}s ago · tick ${tick}`}</span>}>
          <div className="flex flex-col gap-3 p-4 text-[12px]">
            {iss ? (
              <>
                <Row label="lat" value={fmtDeg(iss.latitude, true)} />
                <Row label="lon" value={fmtDeg(iss.longitude, false)} />
                <Row label="alt" value={`${iss.altitude.toFixed(1)} km`} />
                <Row label="vel" value={`${Math.round(iss.velocity).toLocaleString()} km/h`} />
                <Row label="vis" value={iss.visibility} />
              </>
            ) : (
              <div className="text-[var(--color-dim)]">fetching telemetry…</div>
            )}
            <div className="mt-2 text-[13px] text-[var(--color-dim)]">source · wheretheiss.at · norad 25544</div>
          </div>
        </Tile>

        <Tile label="mission clock">
          <MissionClock />
        </Tile>

        <Tile label="notes" footer={<span>iss orbits earth ≈ every 93 min</span>}>
          <div className="flex flex-col gap-2 p-4 text-[12px] text-[var(--color-dim)]">
            <p className="text-[var(--color-fg)]">you are watching humans live, right now, 400km up.</p>
            <p>if the stream goes black the camera is on the night side. wait a few minutes and it comes back.</p>
            <p>the crew is usually asleep <span className="text-[var(--color-fg)]">21:30–06:00 utc</span>.</p>
          </div>
        </Tile>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-1 last:border-0">
      <span className="tracking-[0.12em] text-[var(--color-dim)]">{label}</span>
      <span className="tabular-nums text-[var(--color-fg)]">{value}</span>
    </div>
  )
}

function fmtDeg(v: number, isLat: boolean): string {
  const hem = isLat ? (v >= 0 ? 'n' : 's') : (v >= 0 ? 'e' : 'w')
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = (a - d) * 60
  return `${d.toString().padStart(isLat ? 2 : 3, '0')}° ${m.toFixed(3)}′ ${hem}`
}
