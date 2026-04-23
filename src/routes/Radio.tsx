import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tile from '../components/Tile'
import Slider from '../components/Slider'
import { rafLoop, intervalLoop, whileVisible } from '../lib/rafLoop'
import { prefersReducedMotion } from '../lib/canvas'
import {
  fetchStationsPaged, fetchTopCountries, fetchTopTags, registerClick,
  type Station, type CountryEntry, type TagEntry,
} from '../modules/radio/api'
import {
  buildStationGrid,
  createGlobeState,
  latLonToScreen,
  nearestStation,
  renderGlobe,
  solarSubPoint,
  sphereFromScreen,
  stationsNear,
  type GlobeStats,
} from '../modules/radio/globe'

const PAGE_SIZE = 50
const SEED_PAGES = 6           // ~3000 stations for the initial globe
const FILTER_PAGES = 3         // ~1500 stations once a chip is active
const REFETCH_DEBOUNCE_MS = 350
const VOLUME_KEY = 'pirte:radio:vol'
const LAST_UUID_KEY = 'pirte:radio:last'

/* pin radius — when you click the globe, stations within this angular
   distance (radians) of the pick point populate the sidebar list. 5°
   ≈ 550 km which feels "city-scale" vs "country-scale". */
const PIN_RADIUS_RAD = (5 * Math.PI) / 180

type Status =
  | { kind: 'boot' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

type GridSize = { cols: number; rows: number; cellAspect: number }

export default function Radio() {
  const [status, setStatus] = useState<Status>({ kind: 'boot' })
  const [seed, setSeed] = useState<Station[]>([])
  const [result, setResult] = useState<Station[]>([])
  const [fetching, setFetching] = useState(false)
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
  const [hoverStationId, setHoverStationId] = useState<string | null>(null)  // from list
  const [pinnedPoint, setPinnedPoint] = useState<{ X: number; Y: number; Z: number } | null>(null)
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number; stations: Station[] } | null>(null)
  const [page, setPage] = useState(0)
  const [gridSize, setGridSize] = useState<GridSize>({ cols: 0, rows: 0, cellAspect: 0.55 })
  const [stats, setStats] = useState<GlobeStats | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLPreElement>(null)
  const hotRef  = useRef<HTMLPreElement>(null)
  const dotRef  = useRef<HTMLPreElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef(createGlobeState())
  const [, rerender] = useState(0)
  const forceRerender = () => rerender((n) => n + 1)

  const filterActive = !!(country || tag || query.trim())

  /* ---------------- initial fetch ---------------- */

  useEffect(() => {
    let cancelled = false
    setStatus({ kind: 'loading' })
    ;(async () => {
      try {
        const [st, co, tg] = await Promise.all([
          fetchStationsPaged({ order: 'clickcount' }, SEED_PAGES),
          fetchTopCountries(30),
          fetchTopTags(40),
        ])
        if (cancelled) return
        setSeed(st)
        setResult(st)
        setCountries(co)
        setTags(tg)
        setStatus({ kind: 'ready' })
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' })
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* ---------------- filter → server refetch (debounced) ---------------- */

  useEffect(() => {
    if (status.kind !== 'ready') return
    if (!filterActive) {
      setResult(seed)
      setFetching(false)
      return
    }
    let cancelled = false
    setFetching(true)
    const handle = setTimeout(async () => {
      try {
        const st = await fetchStationsPaged(
          {
            order: 'clickcount',
            countrycode: country || undefined,
            tag: tag || undefined,
            name: query.trim() || undefined,
          },
          FILTER_PAGES,
        )
        if (cancelled) return
        setResult(st)
      } catch {
        // leave the prior result intact on failure
      } finally {
        if (!cancelled) setFetching(false)
      }
    }, REFETCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [status.kind, filterActive, country, tag, query, seed])

  /* ---------------- station grid + list derivation ---------------- */

  const stationGrid = useMemo(() => buildStationGrid(result), [result])

  const visibleList = useMemo(() => {
    if (!pinnedPoint) return result
    const near = stationsNear(stationGrid, pinnedPoint.X, pinnedPoint.Y, pinnedPoint.Z, PIN_RADIUS_RAD)
    // if pinned on empty ocean with nothing nearby, fall back to the full list
    return near.length > 0 ? near : result
  }, [pinnedPoint, stationGrid, result])

  const totalList = visibleList.length
  const pageCount = Math.max(1, Math.ceil(totalList / PAGE_SIZE))
  const pageClamped = Math.min(page, pageCount - 1)
  const displayed = useMemo(
    () => visibleList.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE),
    [visibleList, pageClamped],
  )

  useEffect(() => {
    setPage(0)
    setPinnedPoint(null)
  }, [country, tag, query])

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1))
  }, [page, pageCount])

  /* ---------------- current station ---------------- */

  const current = useMemo(() => {
    if (!currentId) return null
    return (
      result.find((s) => s.id === currentId) ??
      seed.find((s) => s.id === currentId) ??
      null
    )
  }, [currentId, result, seed])

  const hoverStation = useMemo(() => {
    if (!hoverStationId) return null
    return visibleList.find((s) => s.id === hoverStationId) ?? null
  }, [hoverStationId, visibleList])

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

  // pause audio when the tab is hidden — metered-data savings + browsers
  // throttle media-element timers on hidden tabs anyway, so sustained playback
  // there is lossy. we resume ONLY if the user intended to be playing when
  // the tab went away, so a paused stream stays paused.
  const playIntentRef = useRef(false)
  useEffect(() => { playIntentRef.current = playing }, [playing])
  useEffect(() => {
    return whileVisible(() => {
      const a = audioRef.current
      if (a && a.src && a.paused && playIntentRef.current) {
        a.play().catch(() => { /* autoplay may be blocked post-hide */ })
      }
      return () => {
        const a2 = audioRef.current
        if (a2 && !a2.paused) a2.pause()
      }
    })
  }, [])

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
    const pool = (visibleList.length ? visibleList : result).filter((s) => s.id !== currentId)
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    setCurrentId(pick.id)
  }, [visibleList, result, currentId])

  const nextInFilter = useCallback(() => {
    const pool = visibleList.length ? visibleList : result
    if (pool.length === 0) return
    const i = pool.findIndex((s) => s.id === currentId)
    const next = pool[(i + 1 + pool.length) % pool.length]
    setCurrentId(next.id)
  }, [visibleList, result, currentId])

  const prevInFilter = useCallback(() => {
    const pool = visibleList.length ? visibleList : result
    if (pool.length === 0) return
    const i = pool.findIndex((s) => s.id === currentId)
    const prev = pool[(i - 1 + pool.length) % pool.length]
    setCurrentId(prev.id)
  }, [visibleList, result, currentId])

  const clearFilters = useCallback(() => {
    setQuery('')
    setCountry('')
    setTag('')
    setPinnedPoint(null)
  }, [])

  const centerOnCurrent = useCallback(() => {
    if (!current) return
    const g = globeRef.current
    g.rotating = false
    // tween-ish: just jump. the continuous yaw loop can resume with `r` key.
    g.yaw = -((current.lon * Math.PI) / 180)
    g.tilt = Math.max(-1.2, Math.min(1.2, (current.lat * Math.PI) / 180 * 0.9))
    forceRerender()
  }, [current])

  /* ---------------- grid measurement (cols × rows from the pre) ---------------- */

  useEffect(() => {
    const pre = baseRef.current
    const wrap = wrapRef.current
    if (!pre || !wrap) return
    const measure = () => {
      const probe = document.createElement('span')
      probe.textContent = 'M'
      probe.style.visibility = 'hidden'
      probe.style.position = 'absolute'
      pre.appendChild(probe)
      const r = probe.getBoundingClientRect()
      pre.removeChild(probe)
      const cw = r.width, ch = r.height
      if (!cw || !ch) return
      const rect = wrap.getBoundingClientRect()
      const cols = Math.min(200, Math.max(30, Math.floor(rect.width / cw)))
      const rows = Math.min(90,  Math.max(20, Math.floor(rect.height / ch)))
      const cellAspect = Math.max(0.3, Math.min(0.9, cw / ch))
      // hysteresis: require ≥2-cell delta OR meaningful cellAspect change
      // before committing. prevents Math.floor() flipping on 1px window resize
      // from triggering a full globe re-render every drag.
      setGridSize((g) => {
        const dCols = Math.abs(g.cols - cols)
        const dRows = Math.abs(g.rows - rows)
        const dAsp  = Math.abs(g.cellAspect - cellAspect)
        if (g.cols === 0 || g.rows === 0) return { cols, rows, cellAspect }
        if (dCols < 2 && dRows < 2 && dAsp < 0.02) return g
        return { cols, rows, cellAspect }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [status.kind])

  /* ---------------- the globe animation loop ---------------- */

  useEffect(() => {
    const base = baseRef.current
    const hot  = hotRef.current
    const dot  = dotRef.current
    if (!base || !hot || !dot) return
    const { cols, rows, cellAspect } = gridSize
    if (!cols || !rows) return
    if (status.kind !== 'ready') return
    if (stationGrid.all.length === 0) return

    const reduce = prefersReducedMotion()
    let lastStats = 0
    let lastWall = performance.now()

    const cancel = rafLoop((t) => {
      const g = globeRef.current
      const dt = Math.min(0.1, Math.max(0, (t - lastWall) / 1000))
      lastWall = t
      if (!reduce && g.rotating) g.yaw += g.omega * dt
      const frame = renderGlobe(g, cols, rows, cellAspect, stationGrid, new Date())
      base.textContent = frame.base
      hot.textContent  = frame.hot
      dot.textContent  = frame.dots
      if (t - lastStats > 250) {
        lastStats = t
        setStats(frame.stats)
      }
    })
    if (reduce) {
      const frame = renderGlobe(globeRef.current, cols, rows, cellAspect, stationGrid, new Date())
      base.textContent = frame.base
      hot.textContent  = frame.hot
      dot.textContent  = frame.dots
      setStats(frame.stats)
    }
    return cancel
  }, [gridSize, stationGrid, status.kind])

  /* ---------------- pointer — drag to rotate, click to pin ---------------- */

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let dragging = false
    let moved = false
    let lastX = 0, lastY = 0
    let resumeAfter = false
    const DRAG_EPS = 4

    const down = (e: PointerEvent) => {
      dragging = true
      moved = false
      lastX = e.clientX; lastY = e.clientY
      const g = globeRef.current
      resumeAfter = g.rotating
      g.rotating = false
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const g = globeRef.current
      const rect = el.getBoundingClientRect()

      // drag path
      if (dragging) {
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        if (!moved && Math.hypot(dx, dy) > DRAG_EPS) moved = true
        lastX = e.clientX; lastY = e.clientY
        if (moved) {
          g.yaw  += dx * 0.008
          g.tilt = Math.max(-1.2, Math.min(1.2, g.tilt - dy * 0.005))
        }
        return
      }

      // hover path — project pointer to lat/lon, find stations nearby
      if (!gridSize.cols || !gridSize.rows) return
      const col = ((e.clientX - rect.left) / rect.width) * gridSize.cols
      const row = ((e.clientY - rect.top)  / rect.height) * gridSize.rows
      const sph = sphereFromScreen(col, row, gridSize.cols, gridSize.rows, gridSize.cellAspect, g.yaw, g.tilt)
      if (!sph) { setHoverTip(null); return }
      const near = stationsNear(stationGrid, sph.X, sph.Y, sph.Z, PIN_RADIUS_RAD * 0.6)
      if (near.length === 0) { setHoverTip(null); return }
      setHoverTip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        stations: near,
      })
    }
    const up = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      const g = globeRef.current

      // click-without-drag → pick nearest station under the pointer
      if (!moved) {
        const rect = el.getBoundingClientRect()
        if (!gridSize.cols || !gridSize.rows) return
        const col = ((e.clientX - rect.left) / rect.width) * gridSize.cols
        const row = ((e.clientY - rect.top)  / rect.height) * gridSize.rows
        const sph = sphereFromScreen(col, row, gridSize.cols, gridSize.rows, gridSize.cellAspect, g.yaw, g.tilt)
        if (sph) {
          const hit = nearestStation(stationGrid, sph.X, sph.Y, sph.Z, 0.05)
          if (hit) {
            // direct click on a station dot → play it
            playStation(hit.station.id)
          } else {
            // empty spot → pin this point so the sidebar narrows to the neighborhood
            if (pinnedPoint &&
                Math.abs(pinnedPoint.X - sph.X) < 1e-6 &&
                Math.abs(pinnedPoint.Y - sph.Y) < 1e-6) {
              setPinnedPoint(null)
            } else {
              setPinnedPoint(sph)
              setPage(0)
              if (listRef.current) listRef.current.scrollTop = 0
            }
          }
        }
      }

      if (resumeAfter) g.rotating = true
    }
    const leave = () => setHoverTip(null)

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup',   up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup',   up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gridSize, stationGrid, playStation, pinnedPoint])

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') {
        e.preventDefault()
        if (current) { playStation(current.id); return }
        const pool = visibleList.length ? visibleList : result
        if (pool[0]) playStation(pool[0].id)
        return
      }
      if (e.key === 'Escape') {
        if (pinnedPoint) { setPinnedPoint(null); return }
        if (current) { stop(); return }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 's') shuffle()
      else if (k === 'n' || e.key === 'ArrowRight') nextInFilter()
      else if (k === 'p' || e.key === 'ArrowLeft') prevInFilter()
      else if (k === 'r') {
        globeRef.current.rotating = !globeRef.current.rotating
        forceRerender()
      }
      else if (k === 'g') {
        globeRef.current.graticule = !globeRef.current.graticule
        forceRerender()
      }
      else if (k === 'l') {
        globeRef.current.lighting = !globeRef.current.lighting
        forceRerender()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, visibleList, result, pinnedPoint, playStation, shuffle, nextInFilter, prevInFilter, stop])

  /* ---------------- per-frame marker positions (re-render at ~15 hz) ---------------- */

  // these are the 3 special-state markers (hover, pinned, playing) — for them
  // we need dom elements that can emit halos / pulses / colors. we re-project
  // every ~60ms so they follow the rotating globe without re-rendering the
  // whole tree every frame.
  const [markerTick, setMarkerTick] = useState(0)
  useEffect(() => {
    if (status.kind !== 'ready') return
    // intervalLoop auto-pauses when the tab is hidden — no more 15hz setState
    // churn in the background
    return intervalLoop(() => setMarkerTick((n) => (n + 1) & 0xffff), 66)
  }, [status.kind])

  const projectStation = (s: Station | null) => {
    if (!s || !gridSize.cols || !gridSize.rows) return null
    const g = globeRef.current
    const p = latLonToScreen(s.lat, s.lon, gridSize.cols, gridSize.rows, gridSize.cellAspect, g.yaw, g.tilt)
    return { ...p, station: s }
  }
  const projectPoint = (pt: { X: number; Y: number; Z: number } | null) => {
    if (!pt || !gridSize.cols || !gridSize.rows) return null
    const g = globeRef.current
    // invert: (X,Y,Z) → lat/lon → latLonToScreen (reuse the same path)
    const lat = Math.asin(Math.max(-1, Math.min(1, pt.Y))) * 180 / Math.PI
    const lon = Math.atan2(pt.X, pt.Z) * 180 / Math.PI
    return latLonToScreen(lat, lon, gridSize.cols, gridSize.rows, gridSize.cellAspect, g.yaw, g.tilt)
  }

  // marker projections — re-evaluated on every markerTick
  void markerTick
  const playingProj = projectStation(current)
  const hoverProj   = projectStation(hoverStation)
  const pinnedProj  = projectPoint(pinnedPoint)

  /* ---------------- render ---------------- */

  const listLow = totalList === 0 ? 0 : pageClamped * PAGE_SIZE + 1
  const listHigh = Math.min(totalList, (pageClamped + 1) * PAGE_SIZE)
  const listHeaderCount = totalList === 0 ? '0' : `${listLow}–${listHigh} of ${totalList}`
  const g = globeRef.current
  const sunNow = solarSubPoint(new Date())

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setStreamErr('stream error') }}
      />

      <Tile
        label={current ? `radio · ${current.name}` : 'radio · binary earth'}
        tag={filterActive ? (country || tag || 'search') : 'world'}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              {status.kind === 'loading' && 'fetching world radio…'}
              {status.kind === 'error'   && `api err · ${status.message}`}
              {status.kind === 'ready'   && (
                <span className="tracking-[0.08em]">
                  drag · rotate · click · play · space/n/p · esc clear · g grid · l light · r spin
                </span>
              )}
              {streamErr && ` · ${streamErr}`}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${playing ? 'bg-[#ff4b5e]' : 'bg-[var(--color-dim)]'}`}
                style={playing ? { boxShadow: '0 0 8px #ff4b5e' } : undefined}
              />
              <span className="tracking-[0.12em]">{playing ? 'live' : 'idle'}</span>
            </span>
          </div>
        }
      >
        <div
          ref={wrapRef}
          className="relative aspect-[16/10] max-h-[calc(100dvh-14rem)] w-full cursor-grab touch-none select-none active:cursor-grabbing"
        >
          {status.kind !== 'ready' ? (
            <div className="grid h-full place-items-center text-[13px] tracking-[0.18em] text-[var(--color-dim)]">
              {status.kind === 'error' ? `unable to reach radio-browser — ${status.message}` : 'fetching world radio…'}
            </div>
          ) : (
            <>
              {/* base binary globe — land + ocean + stippling */}
              <pre
                ref={baseRef}
                className="m-0 h-full w-full whitespace-pre p-3 text-[12px] leading-[1.0] text-[var(--color-dim)]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              {/* hot kde overlay — top-decile density glows warm */}
              <pre
                ref={hotRef}
                aria-hidden
                className="radio-hot pointer-events-none absolute inset-0 m-0 h-full w-full whitespace-pre p-3 text-[12px] leading-[1.0]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              {/* station dots — every visible station as a small bullet */}
              <pre
                ref={dotRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 m-0 h-full w-full whitespace-pre p-3 text-[12px] leading-[1.0] text-[var(--color-fg)]"
                style={{ fontVariantNumeric: 'tabular-nums', textShadow: '0 0 4px rgba(255,255,255,0.35)' }}
              />

              {/* special-state markers */}
              {pinnedProj && pinnedProj.visible && (
                <MarkerSpan
                  ch="◎"
                  left={pinnedProj.col}
                  top={pinnedProj.row}
                  cols={gridSize.cols}
                  rows={gridSize.rows}
                  color="var(--color-fg)"
                  glow="0 0 6px var(--color-fg)"
                />
              )}
              {hoverProj && hoverProj.visible && (
                <MarkerSpan
                  ch="◉"
                  className="radio-pulse"
                  left={hoverProj.col}
                  top={hoverProj.row}
                  cols={gridSize.cols}
                  rows={gridSize.rows}
                  color="var(--color-fg)"
                />
              )}
              {playingProj && playingProj.visible && (
                <MarkerSpan
                  ch="●"
                  left={playingProj.col}
                  top={playingProj.row}
                  cols={gridSize.cols}
                  rows={gridSize.rows}
                  color="#ff4b5e"
                  glow="0 0 10px #ff4b5e"
                />
              )}

              {/* hover tooltip */}
              {hoverTip && hoverTip.stations.length > 0 && (
                <div
                  className="pointer-events-none absolute z-10 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-2 py-1.5 text-[13px] backdrop-blur-md"
                  style={{
                    left: hoverTip.x + 16,
                    top:  hoverTip.y + 4,
                    maxWidth: 280,
                  }}
                >
                  {hoverTip.stations.slice(0, 4).map((s) => (
                    <div key={s.id} className="truncate">
                      <span className="text-[var(--color-fg)]">{s.name}</span>
                      <span className="ml-1 text-[var(--color-dim)]">· {s.country}</span>
                    </div>
                  ))}
                  {hoverTip.stations.length > 4 && (
                    <div className="text-[12px] text-[var(--color-dim)]">+ {hoverTip.stations.length - 4} more…</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Tile>

      {/* sidebar */}
      <div className="flex min-w-0 flex-col gap-4">
        <Tile label="now playing" tag={current ? current.countrycode : '—'}>
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
                  <button data-interactive onClick={centerOnCurrent} title="re-center globe on this station">⊙ center</button>
                  <button data-interactive onClick={stop} className="ml-auto">stop</button>
                </div>
              </>
            ) : (
              <div className="text-[var(--color-dim)]">nothing playing · space or click a dot to start</div>
            )}
            <Slider label="volume" min={0} max={1} step={0.01} value={volume} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </Tile>

        <Tile label="view">
          <div className="flex flex-col gap-2 p-3">
            <Slider
              label="rotation ω"
              min={-1.2} max={1.2} step={0.01}
              value={g.omega}
              format={(v) => v.toFixed(2)}
              onChange={(v) => { g.omega = v; forceRerender() }}
            />
            <Slider
              label="axial tilt"
              min={-1.2} max={1.2} step={0.01}
              value={g.tilt}
              format={(v) => v.toFixed(2)}
              onChange={(v) => { g.tilt = v; forceRerender() }}
            />
            <div className="grid grid-cols-3 gap-1 text-[13px] tracking-[0.06em]">
              <button
                data-interactive
                onClick={() => { g.rotating = !g.rotating; forceRerender() }}
                className={`!px-2 !py-1 ${g.rotating ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
              >{g.rotating ? 'spinning' : 'stopped'}</button>
              <button
                data-interactive
                onClick={() => { g.lighting = !g.lighting; forceRerender() }}
                className={`!px-2 !py-1 ${g.lighting ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
              >{g.lighting ? 'lit' : 'flat'}</button>
              <button
                data-interactive
                onClick={() => { g.graticule = !g.graticule; forceRerender() }}
                className={`!px-2 !py-1 ${g.graticule ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
              >{g.graticule ? 'graticule' : 'no grid'}</button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[13px] tracking-[0.06em]">
              <button
                data-interactive
                onClick={() => { g.sunSync = !g.sunSync; forceRerender() }}
                className={`!px-2 !py-1 ${g.sunSync ? '!border-[var(--color-fg)] text-[var(--color-fg)]' : 'text-[var(--color-dim)]'}`}
              >{g.sunSync ? 'sun · UTC' : 'fixed light'}</button>
              <button
                data-interactive
                onClick={centerOnCurrent}
                disabled={!current}
                className="!px-2 !py-1 disabled:opacity-40"
              >center · playing</button>
            </div>
            <div className="text-[11px] tabular-nums tracking-[0.08em] text-[var(--color-dim)]">
              <div className="flex justify-between"><span>sun sub-point</span><span>{sunNow.lat.toFixed(1)}° · {sunNow.lon.toFixed(1)}°</span></div>
              {stats && (
                <>
                  <div className="flex justify-between"><span>grid</span><span>{stats.cols}×{stats.rows}</span></div>
                  <div className="flex justify-between"><span>stations visible</span><span>{stats.visibleStations}</span></div>
                  <div className="flex justify-between">
                    <span>land · lit</span>
                    <span>
                      {((stats.landCells / Math.max(1, stats.surfCells)) * 100).toFixed(0)}% · {((stats.litCells / Math.max(1, stats.surfCells)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Tile>

        <Tile label="filter" tag={fetching ? 'fetching…' : undefined}>
          <div className="flex flex-col gap-2 p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search name…"
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
              {(filterActive || pinnedPoint) && (
                <button data-interactive onClick={clearFilters}>clear</button>
              )}
            </div>
          </div>
        </Tile>

        <Tile
          label={pinnedPoint ? `pinned · ${listHeaderCount}` : `stations · ${listHeaderCount}`}
          tag={status.kind === 'loading' ? 'loading' : (fetching ? 'fetching' : 'live')}
        >
          <div
            ref={listRef}
            className={`max-h-[40vh] overflow-auto p-2 transition-opacity ${fetching ? 'opacity-60' : 'opacity-100'}`}
          >
            {displayed.map((s) => {
              const active = s.id === currentId
              return (
                <button
                  key={s.id}
                  data-interactive
                  onClick={() => playStation(s.id)}
                  onPointerEnter={() => setHoverStationId(s.id)}
                  onPointerLeave={() => setHoverStationId((id) => (id === s.id ? null : id))}
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
            {totalList === 0 && status.kind === 'ready' && !fetching && (
              <div className="p-3 text-[13px] text-[var(--color-dim)]">
                {pinnedPoint ? 'no stations within 5° of the pin · click elsewhere or esc' : 'no stations match · clear the filter'}
              </div>
            )}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] px-3 py-2 text-[12px] text-[var(--color-dim)]">
              <button
                data-interactive
                disabled={pageClamped === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="!px-2 !py-0.5 disabled:opacity-40"
              >‹ prev</button>
              <span>page {pageClamped + 1}/{pageCount}</span>
              <button
                data-interactive
                disabled={pageClamped >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="!px-2 !py-0.5 disabled:opacity-40"
              >next ›</button>
            </div>
          )}
        </Tile>
      </div>
    </div>
  )
}

function MarkerSpan({
  ch, left, top, cols, rows, color, glow, className,
}: {
  ch: string
  left: number  // col space
  top: number   // row space
  cols: number
  rows: number
  color: string
  glow?: string
  className?: string
}) {
  // convert cell-space (col, row) to percent of the pre's rendered area
  const xPct = cols ? (left / cols) * 100 : 0
  const yPct = rows ? (top  / rows) * 100 : 0
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute text-[12px] leading-[1.0] ${className ?? ''}`}
      style={{
        left: `calc(${xPct}% + 12px)`,
        top:  `calc(${yPct}% + 12px)`,
        color,
        textShadow: glow,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {ch}
    </span>
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
