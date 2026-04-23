import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { prefersReducedMotion } from '../lib/canvas'
import { intervalLoop } from '../lib/rafLoop'
import { moduleRoutes, prefetchRoute } from '../lib/routes'
import { WorldAmbience } from '../modules/world/audio'
import { WorldCityWorkerClient } from '../modules/world/cityWorkerClient'
import {
  MANHATTAN_FOCUS,
  buildManhattanStreamPlan,
  isManhattanFocus,
  isNearManhattan,
  normalizeManhattanFocus,
} from '../modules/world/manhattan'
import { createWorldHomeProviders } from '../modules/world/providers'
import type {
  BrickPhase,
  BrickStreamState,
  PlaceResult,
  ProjectedMarker,
  VoxelBrick,
  WeatherSignals,
  WorldFocus,
  WorldQuality,
  WorldSceneMode,
  WorldVisualMode,
} from '../modules/world/types'
import { VoxelEarthRenderer } from '../modules/world/voxelEarthRenderer'

const FOCUS_KEY = 'pirte.world.focus'

type BrickSummary = {
  active: number
  terrain: number
  structures: number
  roads: number
  parks: number
  water: number
}

const EMPTY_SUMMARY: BrickSummary = {
  active: 0,
  terrain: 0,
  structures: 0,
  roads: 0,
  parks: 0,
  water: 0,
}

const STREAM_PHASE_LABELS: Record<BrickPhase, string> = {
  coarse: 'coarse city shell',
  neighborhood: 'neighborhood bricks',
  detail: 'structure refinement',
}

function detectInitialQuality(): WorldQuality {
  if (typeof window === 'undefined') return 'balanced'
  if (prefersReducedMotion()) return 'low'

  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  if (saveData) return 'low'
  if (window.innerWidth >= 1440 && memory >= 8) return 'cinematic'
  if (window.innerWidth < 900 || memory <= 4) return 'low'
  return 'balanced'
}

function initialFocus(): WorldFocus | null {
  try {
    const raw = sessionStorage.getItem(FOCUS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorldFocus
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null
    return parsed
  } catch {
    return null
  }
}

function formatCoord(value: number, axis: 'lat' | 'lon') {
  const dir = axis === 'lat'
    ? value >= 0 ? 'N' : 'S'
    : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(2)}°${dir}`
}

function formatSignal(value: number | null, suffix: string) {
  return value == null || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(1)}${suffix}`
}

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function brickKey(id: VoxelBrick['id']) {
  return `${id.city}:${id.lod}:${id.x}:${id.y}:${id.z}`
}

function boundsOverlap(a: VoxelBrick['bounds'], b: VoxelBrick['bounds']) {
  return !(
    a.max[0] <= b.min[0] ||
    a.min[0] >= b.max[0] ||
    a.max[1] <= b.min[1] ||
    a.min[1] >= b.max[1] ||
    a.max[2] <= b.min[2] ||
    a.min[2] >= b.max[2]
  )
}

function summarizeBricks(bricks: Iterable<VoxelBrick>): BrickSummary {
  const next = { ...EMPTY_SUMMARY }
  for (const brick of bricks) {
    next.active += 1
    next.terrain += brick.kindCounts.terrain
    next.structures += brick.kindCounts.structures
    next.roads += brick.kindCounts.roads
    next.parks += brick.kindCounts.parks
    next.water += brick.kindCounts.water
  }
  return next
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('[data-interactive]'))
}

export default function Index() {
  const providers = useMemo(() => createWorldHomeProviders(), [])
  const workerRef = useRef<WorldCityWorkerClient | null>(null)
  const rendererRef = useRef<VoxelEarthRenderer | null>(null)
  const ambienceRef = useRef<WorldAmbience | null>(null)
  const activeBricksRef = useRef<Map<string, VoxelBrick>>(new Map())
  const streamRunRef = useRef(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [quality, setQuality] = useState<WorldQuality>(() => detectInitialQuality())
  const [visualMode, setVisualMode] = useState<WorldVisualMode>('hybrid')
  const [mode, setMode] = useState<WorldSceneMode>(() => initialFocus() ? 'region' : 'orbit')
  const [focus, setFocus] = useState<WorldFocus | null>(() => initialFocus())
  const [weather, setWeather] = useState<WeatherSignals | null>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [weatherKey, setWeatherKey] = useState<string | null>(null)
  const [orbitMarkers, setOrbitMarkers] = useState<ProjectedMarker[]>([])
  const [bootStatus, setBootStatus] = useState<string | null>('booting voxel earth')
  const [focusStatus, setFocusStatus] = useState<string | null>(null)
  const [streamStatus, setStreamStatus] = useState<string | null>(null)
  const [streamState, setStreamState] = useState<BrickStreamState | null>(null)
  const [brickSummary, setBrickSummary] = useState<BrickSummary>(EMPTY_SUMMARY)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [debugFields, setDebugFields] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pointerRef = useRef({
    id: -1,
    x: 0,
    y: 0,
    moved: false,
  })

  const focusKey = focus ? `${focus.lat.toFixed(2)}:${focus.lon.toFixed(2)}` : null
  const scopedWeather = useMemo(
    () => focus && weatherKey === focusKey ? weather : null,
    [focus, focusKey, weather, weatherKey],
  )
  const cityFocused = isManhattanFocus(focus)
  const cityStreaming = cityFocused && mode !== 'orbit'
  const loadingLabel = streamStatus ?? focusStatus ?? bootStatus

  const returnToOrbit = useCallback((clearFocus = false) => {
    setMode('orbit')
    setStreamStatus(null)
    setFocusStatus(null)
    setError(null)
    if (clearFocus) {
      setFocus(null)
      setWeather(null)
      setWeatherKey(null)
      setResults([])
      setQuery('')
    }
  }, [])

  useEffect(() => {
    workerRef.current = new WorldCityWorkerClient()
    ambienceRef.current = new WorldAmbience()
    return () => {
      workerRef.current?.destroy()
      workerRef.current = null
      ambienceRef.current?.dispose()
      ambienceRef.current = null
    }
  }, [])

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }

    const prime = () => {
      for (const route of moduleRoutes.slice(0, 4)) prefetchRoute(route.path)
    }

    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(prime, { timeout: 900 })
      return () => idleWindow.cancelIdleCallback?.(id)
    }

    const id = window.setTimeout(prime, 260)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const renderer = new VoxelEarthRenderer(canvas, wrap)
    rendererRef.current = renderer

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      renderer.resize(rect.width, rect.height)
    }

    resize()
    setBootStatus(null)
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    return () => {
      ro.disconnect()
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setSceneMode(mode)
  }, [mode])

  useEffect(() => {
    rendererRef.current?.setVisualMode(visualMode)
  }, [visualMode])

  useEffect(() => {
    rendererRef.current?.setFocus(focus)
    if (!focus) return
    try {
      sessionStorage.setItem(FOCUS_KEY, JSON.stringify(focus))
    } catch {
      // ignore
    }
  }, [focus])

  useEffect(() => {
    rendererRef.current?.setWeather(scopedWeather)
  }, [scopedWeather])

  useEffect(() => {
    rendererRef.current?.setDebugFields(debugFields)
  }, [debugFields])

  useEffect(() => {
    if (deferredQuery.trim().length < 2) return

    const controller = new AbortController()
    providers.places.search(deferredQuery, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        startTransition(() => setResults(next))
        setSearching(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setSearching(false)
      })

    return () => controller.abort()
  }, [deferredQuery, providers])

  useEffect(() => {
    if (!focus) return

    const controller = new AbortController()
    const nextKey = `${focus.lat.toFixed(2)}:${focus.lon.toFixed(2)}`
    queueMicrotask(() => {
      if (!controller.signal.aborted) setFocusStatus('sampling local weather')
    })
    providers.weather.readFocus(focus, controller.signal)
      .then((nextWeather) => {
        if (controller.signal.aborted) return
        setWeather(nextWeather)
        setWeatherKey(nextKey)
      })
      .catch((event: unknown) => {
        if (controller.signal.aborted) return
        console.error('[pirte] weather read failed', event)
      })
      .finally(() => {
        if (!controller.signal.aborted) setFocusStatus(null)
      })

    return () => controller.abort()
  }, [focus, providers])

  useEffect(() => {
    ambienceRef.current?.setEnabled(audioEnabled)
  }, [audioEnabled])

  useEffect(() => {
    ambienceRef.current?.update({
      mode,
      weather: scopedWeather,
      intensity:
        0.24 +
        Math.min(0.56, brickSummary.active * 0.01) +
        (streamState ? streamState.ready / Math.max(1, streamState.requested) * 0.22 : 0) +
        (debugFields ? 0.08 : 0),
    })
  }, [audioEnabled, brickSummary.active, debugFields, mode, scopedWeather, streamState])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return

    return intervalLoop(() => {
      if (mode !== 'orbit') {
        setOrbitMarkers([])
        return
      }

      const next: ProjectedMarker[] = []
      const manhattanMarker = renderer.projectLocation({
        id: 'manhattan-slice',
        lat: MANHATTAN_FOCUS.lat,
        lon: MANHATTAN_FOCUS.lon,
        label: 'Manhattan slice',
        accent: '#9be8ff',
      })
      if (manhattanMarker) next.push(manhattanMarker)

      if (focus && !isManhattanFocus(focus)) {
        const projected = renderer.projectFocus()
        if (projected) next.push(projected)
      }

      startTransition(() => setOrbitMarkers(next))
    }, 120)
  }, [focus, mode])

  useEffect(() => {
    const worker = workerRef.current
    const renderer = rendererRef.current
    const runId = ++streamRunRef.current

    const resetScene = () => {
      activeBricksRef.current.clear()
      renderer?.clearBricks()
      setBrickSummary(EMPTY_SUMMARY)
      setStreamState(null)
    }

    if (!worker || !renderer) return

    if (!focus || mode === 'orbit') {
      resetScene()
      queueMicrotask(() => {
        if (streamRunRef.current === runId) setStreamStatus(null)
      })
      return
    }

    if (!isManhattanFocus(focus)) {
      resetScene()
      queueMicrotask(() => {
        if (streamRunRef.current === runId) {
          setStreamStatus('planet focus only · Manhattan is the current voxel city slice')
        }
      })
      return
    }

    resetScene()
    queueMicrotask(() => {
      if (streamRunRef.current === runId) setError(null)
    })

    let disposed = false

    const stale = () => disposed || streamRunRef.current !== runId
    const recomputeSummary = () => {
      setBrickSummary(summarizeBricks(activeBricksRef.current.values()))
    }

    const upsertBrick = (brick: VoxelBrick) => {
      if (stale()) return

      const obsolete: VoxelBrick['id'][] = []
      for (const existing of activeBricksRef.current.values()) {
        if (existing.id.lod <= brick.id.lod) continue
        if (!boundsOverlap(existing.bounds, brick.bounds)) continue
        obsolete.push(existing.id)
        activeBricksRef.current.delete(brickKey(existing.id))
      }

      if (obsolete.length > 0) renderer.removeBricks(obsolete)
      renderer.upsertBrick(brick)
      activeBricksRef.current.set(brickKey(brick.id), brick)
      recomputeSummary()
    }

    const phaseLabel = (phase: BrickPhase) => {
      if (phase === 'coarse') return 'streaming coarse city shell'
      if (phase === 'neighborhood') return 'refining neighborhood rings'
      return 'resolving structure detail'
    }

    void (async () => {
      try {
        const plans = buildManhattanStreamPlan(
          normalizeManhattanFocus(focus),
          quality,
          mode === 'ground' ? 'ground' : 'region',
        )

        for (const plan of plans) {
          if (stale()) return

          const phaseState: BrickStreamState = {
            phase: plan.phase,
            requested: plan.ids.length,
            loading: 0,
            ready: 0,
            failed: 0,
          }
          setStreamState({ ...phaseState })
          setStreamStatus(phaseLabel(plan.phase))

          const concurrency = plan.phase === 'coarse'
            ? 1
            : quality === 'cinematic'
              ? 3
              : quality === 'balanced'
                ? 2
                : 1
          let cursor = 0

          const drain = async () => {
            while (!stale()) {
              const current = plan.ids[cursor]
              cursor += 1
              if (!current) return

              phaseState.loading += 1
              setStreamState({ ...phaseState })
              try {
                const brick = await worker.buildBrick(current, plan.phase)
                if (stale()) return
                upsertBrick(brick)
                phaseState.ready += 1
              } catch (event: unknown) {
                if (stale()) return
                phaseState.failed += 1
                console.error('[pirte] voxel brick failed', event)
              } finally {
                phaseState.loading = Math.max(0, phaseState.loading - 1)
                if (!stale()) setStreamState({ ...phaseState })
              }
            }
          }

          await Promise.all(Array.from({ length: concurrency }, drain))
          if (stale()) return
          if (phaseState.failed > 0) {
            setError(`${phaseState.failed} ${plan.phase} bricks skipped`)
          }
        }

        if (!stale()) {
          setStreamStatus(null)
          if (activeBricksRef.current.size < 1) {
            setError('voxel slice unavailable')
          }
        }
      } catch (event: unknown) {
        if (stale()) return
        console.error('[pirte] brick stream failed', event)
        setStreamStatus(null)
        if (activeBricksRef.current.size < 1) {
          setError('brick stream unavailable')
        } else {
          setError('detail stream degraded')
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [focus, mode, quality])

  const resolveFocus = useCallback(async (next: WorldFocus, nextMode: WorldSceneMode) => {
    const base = isNearManhattan(next.lat, next.lon)
      ? normalizeManhattanFocus({
          ...next,
          label: next.label || 'Manhattan',
          zoom: Math.max(next.zoom, MANHATTAN_FOCUS.zoom),
        })
      : next

    setError(null)
    setFocusStatus(
      nextMode === 'ground'
        ? 'descending into voxel slice'
        : isManhattanFocus(base)
          ? 'locking Manhattan slice'
          : 'locating place',
    )

    try {
      const resolved = base.label
        ? base
        : await providers.places.reverse(base.lat, base.lon)
            .then((place) => place ? { ...base, ...place } : base)
      setFocus(isManhattanFocus(resolved) ? normalizeManhattanFocus(resolved) : resolved)
      setMode(nextMode)
      setResults([])
      setQuery('')
    } catch {
      setFocus(base)
      setMode(nextMode)
    } finally {
      if (nextMode === 'orbit') setFocusStatus(null)
    }
  }, [providers])

  const jumpToManhattan = useCallback(() => {
    void resolveFocus(MANHATTAN_FOCUS, 'region')
  }, [resolveFocus])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return
    if (audioEnabled) {
      const resume = ambienceRef.current?.resume()
      if (resume) void resume.catch(() => {})
    }
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current.id !== event.pointerId) return
    const dx = event.clientX - pointerRef.current.x
    const dy = event.clientY - pointerRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > 6) pointerRef.current.moved = true
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current.id !== event.pointerId) return
    const shouldPick = mode === 'orbit' && !pointerRef.current.moved && !isInteractiveTarget(event.target)
    pointerRef.current.id = -1
    if (!shouldPick) return
    const hit = rendererRef.current?.pickGlobe(event.clientX, event.clientY)
    if (!hit) return
    void resolveFocus({
      lat: hit.lat,
      lon: hit.lon,
      zoom: isNearManhattan(hit.lat, hit.lon) ? MANHATTAN_FOCUS.zoom : 2.7,
      label: isNearManhattan(hit.lat, hit.lon) ? 'Manhattan' : undefined,
    }, 'region')
  }

  const focusLabel = mode === 'orbit' ? 'planet orbit' : focus?.label || 'planetary orbit'
  const targetLabel = mode === 'orbit' && focus ? focus.label || 'selected target' : null
  const sourceLabel = useMemo(() => {
    if (cityStreaming) return 'procedural Manhattan brick stream'
    if (mode === 'orbit') return 'global earth shell'
    if (focus && !cityFocused) return 'planet shell focus'
    return 'global earth shell'
  }, [cityFocused, cityStreaming, focus, mode])
  const streamLabel = streamState
    ? `${streamState.ready}/${streamState.requested}`
    : cityStreaming
      ? 'warming'
      : 'idle'
  const pipelineStatus = streamStatus || focusStatus || (cityStreaming ? 'stable' : focus ? 'planet focus' : 'planet orbit')
  const visibleResults = deferredQuery.trim().length < 2 ? [] : results
  const streamReadout = useMemo(() => {
    const lines = [
      `> ${cityStreaming ? 'manhattan voxel slice' : 'planet shell'}`,
      '',
      `phase........ ${streamState ? STREAM_PHASE_LABELS[streamState.phase] : cityStreaming ? 'staged loader idle' : 'orbit shell'}`,
      `progress..... ${streamState ? `${streamState.ready}/${streamState.requested}` : 'n/a'}`,
      `loading...... ${streamState?.loading ?? 0}`,
      `failures..... ${streamState?.failed ?? 0}`,
      '',
      `active bricks ${formatCount(brickSummary.active)}`,
      `terrain...... ${formatCount(brickSummary.terrain)}`,
      `structures... ${formatCount(brickSummary.structures)}`,
      `roads........ ${formatCount(brickSummary.roads)}`,
      `parks........ ${formatCount(brickSummary.parks)}`,
      `water........ ${formatCount(brickSummary.water)}`,
      '',
      `wind debug... ${debugFields ? 'enabled' : 'hidden'}`,
      `ambience..... ${audioEnabled ? 'armed' : 'muted'}`,
      `temp......... ${formatSignal(scopedWeather?.temperatureC ?? null, '°C')}`,
      `wind......... ${formatSignal(scopedWeather?.windSpeedKph ?? null, ' km/h')}`,
      `wave......... ${formatSignal(scopedWeather?.waveHeightM ?? null, ' m')}`,
    ]

    if (mode === 'orbit' && focus) {
      lines.splice(2, 0, `target....... ${focus.label || 'selected focus'}`)
    }

    if (!cityFocused && focus && mode !== 'orbit') {
      lines.splice(2, 0, 'slice........ Manhattan only in v1')
    }

    return lines.join('\n')
  }, [audioEnabled, brickSummary, cityFocused, cityStreaming, debugFields, focus, mode, scopedWeather, streamState])

  return (
    <section className="relative min-h-[calc(100dvh-112px)] overflow-hidden bg-[var(--color-bg)] lg:min-h-dvh">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {mode === 'orbit' && (
          <div className="pointer-events-none absolute inset-0">
            {orbitMarkers.map((marker) => {
              const interactive = marker.id === 'manhattan-slice'
              const shared = {
                left: `${marker.x}px`,
                top: `${marker.y}px`,
              }
              const className = `absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] backdrop-blur-md ${
                interactive
                  ? 'pointer-events-auto border-[#9be8ff]/65 bg-[#06151b]/55 text-[#d7f7ff]'
                  : 'border-[#ffc58d]/60 bg-[#2a1207]/35 text-[#ffd4ac]'
              }`
              if (!interactive) {
                return (
                  <div key={marker.id} className={className} style={shared}>
                    {marker.label}
                  </div>
                )
              }
              return (
                <button
                  key={marker.id}
                  data-interactive
                  onClick={jumpToManhattan}
                  className={className}
                  style={shared}
                >
                  {marker.label}
                </button>
              )
            })}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0)_48%,rgba(0,0,0,0.44))]" />
      </div>

      <div className="relative z-10 grid min-h-[calc(100dvh-112px)] min-w-0 grid-cols-1 gap-4 p-3 sm:p-5 lg:min-h-dvh lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(280px,340px)] lg:p-6">
        <section className="pointer-events-auto flex min-w-0 flex-col gap-4 rounded-[24px] border border-white/10 bg-[rgba(10,12,18,0.54)] p-4 shadow-[0_28px_80px_-44px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-dim)]">world shell</div>
            <h1 className="mt-2 text-[30px] leading-none tracking-[-0.04em] text-[var(--color-fg)]">pirt,e earth</h1>
            <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-[var(--color-dim)]">
              Orbit the globe, lock Manhattan, then stream coarse city bricks into explicit light voxels and structure detail.
            </p>
          </div>

          <label className="relative block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[var(--color-dim)]">search any place</span>
            <input
              data-interactive
              value={query}
              onChange={(event) => {
                const next = event.target.value
                setQuery(next)
                const active = next.trim().length >= 2
                setSearching(active)
                if (!active) {
                  setResults([])
                  setSearching(false)
                }
              }}
              placeholder="Manhattan, Tokyo, São Paulo, Baltic Sea…"
              className="w-full rounded-[18px] border border-white/12 bg-black/28 px-4 py-3 text-[15px] text-[var(--color-fg)] outline-none transition-colors placeholder:text-white/32 focus:border-white/28"
            />
            {(searching || visibleResults.length > 0) && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[18px] border border-white/10 bg-[rgba(10,12,18,0.88)] p-2 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.92)] backdrop-blur-2xl">
                {searching && (
                  <div className="px-3 py-2 text-[12px] uppercase tracking-[0.18em] text-[var(--color-dim)]">searching…</div>
                )}
                {!searching && visibleResults.map((place) => (
                  <button
                    key={place.id}
                    data-interactive
                    onClick={() => { void resolveFocus(place, 'region') }}
                    className="flex w-full items-center justify-between rounded-[14px] border border-transparent px-3 py-2 text-left text-[13px] text-[var(--color-fg)] hover:border-white/10 hover:bg-white/4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{place.label}</span>
                      <span className="block truncate text-[11px] uppercase tracking-[0.14em] text-[var(--color-dim)]">
                        {place.country || 'world'} · {formatCoord(place.lat, 'lat')} · {formatCoord(place.lon, 'lon')}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-white/12 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/66">
                      focus
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              data-interactive
              onClick={jumpToManhattan}
              className="rounded-full border border-[#9be8ff]/28 bg-[#07161d]/60 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#d7f7ff]"
            >
              enter Manhattan slice
            </button>
            <button
              data-interactive
              onClick={() => setAudioEnabled((current) => !current)}
              className={`rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                audioEnabled
                  ? '!border-[#b5ffd1]/40 !bg-[#0a1d12] text-[#d9ffe6]'
                  : '!border-white/12 !bg-black/28 text-white/64'
              }`}
            >
              ambience {audioEnabled ? 'on' : 'off'}
            </button>
            <button
              data-interactive
              onClick={() => setDebugFields((current) => !current)}
              className={`rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                debugFields
                  ? '!border-[#ffd7a8]/45 !bg-[#241408] text-[#ffd7a8]'
                  : '!border-white/12 !bg-black/28 text-white/64'
              }`}
            >
              field debug {debugFields ? 'on' : 'off'}
            </button>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/58">
              Manhattan is v1 detail slice
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['orbit', 'region', 'ground'] as WorldSceneMode[]).map((entry) => {
              const disabled =
                (entry !== 'orbit' && !focus) ||
                (entry === 'ground' && !cityFocused)
              return (
                <button
                  key={entry}
                  data-interactive
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    setError(null)
                    if (entry === 'orbit') {
                      returnToOrbit(cityFocused)
                      return
                    } else if (cityFocused) {
                      setStreamStatus(entry === 'ground' ? 'descending into voxel slice' : 'locking Manhattan slice')
                    }
                    setMode(entry)
                  }}
                  className={`rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                    mode === entry
                      ? '!border-white/55 !bg-white/12 text-white'
                      : '!border-white/12 !bg-black/28 text-white/64'
                  } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {entry}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['hybrid', 'light', 'ascii'] as WorldVisualMode[]).map((entry) => (
              <button
                key={entry}
                data-interactive
                onClick={() => setVisualMode(entry)}
                className={`rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                  visualMode === entry
                    ? '!border-[#9be8ff]/55 !bg-[#0b2026] text-[#d4f8ff]'
                    : '!border-white/12 !bg-black/28 text-white/64'
                }`}
              >
                {entry}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['low', 'balanced', 'cinematic'] as WorldQuality[]).map((entry) => (
              <button
                key={entry}
                data-interactive
                onClick={() => {
                  setError(null)
                  if (cityStreaming) setStreamStatus('rebuilding voxel brick rings')
                  setQuality(entry)
                }}
                className={`rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${
                  quality === entry
                    ? '!border-[#ffd7a8]/55 !bg-[#241408] text-[#ffd7a8]'
                    : '!border-white/12 !bg-black/28 text-white/64'
                }`}
              >
                {entry}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label={mode === 'orbit' ? 'scene' : 'focus'} value={focusLabel} />
            <MiniStat label="source" value={sourceLabel} />
            <MiniStat label="wind" value={formatSignal(scopedWeather?.windSpeedKph ?? null, ' km/h')} />
            <MiniStat label="wave" value={formatSignal(scopedWeather?.waveHeightM ?? null, ' m')} />
          </div>
        </section>

        <section className="pointer-events-none flex min-w-0 min-h-[46vh] items-end justify-center lg:min-h-full">
          <div className="mb-4 rounded-full border border-white/10 bg-[rgba(8,10,16,0.46)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-white/66 backdrop-blur-xl">
            {mode === 'orbit' && (targetLabel
              ? `planet orbit · target locked: ${targetLabel} · press region or enter Manhattan slice`
              : 'drag to orbit · wheel to zoom · click the globe or enter Manhattan slice')}
            {mode !== 'orbit' && cityFocused && 'streamed Manhattan voxels · coarse city shell -> neighborhood bricks -> structure detail'}
            {mode !== 'orbit' && !cityFocused && 'planet focus active · Manhattan is the current full voxel slice'}
          </div>
        </section>

        <section className="pointer-events-auto flex min-w-0 flex-col gap-4 rounded-[24px] border border-white/10 bg-[rgba(10,12,18,0.54)] p-4 shadow-[0_28px_80px_-44px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-dim)]">{mode === 'orbit' ? 'scene' : 'focus'}</div>
              <div className="mt-1 text-[20px] leading-none tracking-[-0.03em] text-[var(--color-fg)]">{focusLabel}</div>
            </div>
            {focus && (
              <button
                data-interactive
                onClick={() => {
                  returnToOrbit(true)
                }}
                className="!border-white/12 !bg-black/30 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/70"
              >
                ascend
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label={mode === 'orbit' ? 'target' : 'lat'}
              value={mode === 'orbit' ? (targetLabel || 'n/a') : focus ? formatCoord(focus.lat, 'lat') : 'n/a'}
            />
            <MiniStat
              label={mode === 'orbit' ? 'target lon' : 'lon'}
              value={mode === 'orbit' ? (focus ? formatCoord(focus.lon, 'lon') : 'n/a') : focus ? formatCoord(focus.lon, 'lon') : 'n/a'}
            />
            <MiniStat label="stream" value={streamLabel} />
            <MiniStat label="temp" value={formatSignal(scopedWeather?.temperatureC ?? null, '°C')} />
            <MiniStat label="active bricks" value={formatCount(brickSummary.active)} />
            <MiniStat label="structures" value={formatCount(brickSummary.structures)} />
          </div>

          <div className="rounded-[18px] border border-white/10 bg-black/24 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-dim)]">voxel pipeline</div>
              <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/58">
                {streamState ? STREAM_PHASE_LABELS[streamState.phase] : cityStreaming ? 'arming' : 'idle'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="mode" value={mode} />
              <MiniStat label="quality" value={quality} />
              <MiniStat label="source" value={sourceLabel} />
              <MiniStat label="status" value={pipelineStatus} />
            </div>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-black/24 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-dim)]">slice readout</div>
            <pre className="max-h-[320px] overflow-auto rounded-[16px] border border-white/8 bg-[#06080d] px-3 py-3 font-mono text-[10px] leading-[1.18] tracking-[0.01em] text-white/58">
              {streamReadout}
            </pre>
          </div>
        </section>
      </div>

      {(loadingLabel || error) && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          {loadingLabel && (
            <div className="rounded-full border border-white/10 bg-[rgba(10,12,18,0.78)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-white/70 backdrop-blur-xl">
              {loadingLabel}
            </div>
          )}
          {error && (
            <div className="rounded-full border border-[#ff9a8b]/22 bg-[rgba(37,9,7,0.82)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[#ffc0b6] backdrop-blur-xl">
              {error}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-black/22 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-dim)]">{label}</div>
      <div className="mt-2 text-[13px] leading-snug text-[var(--color-fg)]">{value}</div>
    </div>
  )
}
