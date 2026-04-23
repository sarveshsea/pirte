import {
  fetchStationsPaged,
  type Station,
} from '../radio/api'
import { sampleLand } from '../radio/landmass'
import { LruCache, readPersistent, writePersistent } from './cache'
import { clamp, mix, normalizeLon } from './geo'
import { isNearManhattan, normalizeManhattanFocus } from './manhattan'
import type {
  PlaceProvider,
  PlaceResult,
  RadioProvider,
  TerrainBBox,
  TerrainProvider,
  TerrainSample,
  WeatherProvider,
  WeatherSignals,
  WorldFocus,
  WorldProviders,
  WorldQuality,
  WorldSceneMode,
} from './types'

const MAPTILER_KEY = String(import.meta.env.VITE_MAPTILER_KEY || '').trim()
const PLACE_TTL_MS = 1000 * 60 * 60 * 12
const WEATHER_TTL_MS = 1000 * 60 * 20
const TERRAIN_TTL_MS = 1000 * 60 * 60 * 6
const RADIO_TTL_MS = 1000 * 60 * 30
const OPEN_METEO_BATCH_SIZE = 32
const SAVE_DATA = typeof navigator !== 'undefined' && 'connection' in navigator
  ? Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  : false

const placeCache = new LruCache<PlaceResult[]>(24, PLACE_TTL_MS)
const reversePlaceCache = new LruCache<PlaceResult>(24, PLACE_TTL_MS)
const weatherCache = new LruCache<WeatherSignals>(48, WEATHER_TTL_MS)
const terrainCache = new LruCache<TerrainSample>(16, TERRAIN_TTL_MS)
const radioSeedCache = new LruCache<Station[]>(4, RADIO_TTL_MS)

type TerrainPreset = {
  zoom: number
  spanDeg: number
  sampleResolution: number
}

const TERRAIN_PRESETS: Record<WorldQuality, Record<Extract<WorldSceneMode, 'region' | 'ground'>, TerrainPreset>> = {
  low: {
    region: { zoom: 6, spanDeg: 3.8, sampleResolution: 32 },
    ground: { zoom: 8, spanDeg: 1.45, sampleResolution: 48 },
  },
  balanced: {
    region: { zoom: 7, spanDeg: 3.2, sampleResolution: 48 },
    ground: { zoom: 8, spanDeg: 1.1, sampleResolution: 64 },
  },
  cinematic: {
    region: { zoom: 7, spanDeg: 2.8, sampleResolution: 64 },
    ground: { zoom: 9, spanDeg: 0.86, sampleResolution: 80 },
  },
}

function previewResolution(resolution: number) {
  return clamp(Math.round(resolution * 0.55), 24, 40)
}

function fract(value: number) {
  return value - Math.floor(value)
}

function hash2(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
}

function smoothNoise(x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = x - x0
  const ty = y - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const a = hash2(x0, y0)
  const b = hash2(x0 + 1, y0)
  const c = hash2(x0, y0 + 1)
  const d = hash2(x0 + 1, y0 + 1)
  const ab = mix(a, b, sx)
  const cd = mix(c, d, sx)
  return mix(ab, cd, sy)
}

function fbm(x: number, y: number, octaves = 4) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let totalAmplitude = 0
  for (let index = 0; index < octaves; index++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude
    totalAmplitude += amplitude
    frequency *= 2.03
    amplitude *= 0.5
  }
  return value / Math.max(0.0001, totalAmplitude)
}

function ridged(x: number, y: number, octaves = 4) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let totalAmplitude = 0
  for (let index = 0; index < octaves; index++) {
    const sample = smoothNoise(x * frequency, y * frequency)
    value += (1 - Math.abs(sample * 2 - 1)) * amplitude
    totalAmplitude += amplitude
    frequency *= 2.17
    amplitude *= 0.5
  }
  return value / Math.max(0.0001, totalAmplitude)
}

function buildSyntheticHeights(
  focus: WorldFocus,
  bbox: TerrainBBox,
  width: number,
  height: number,
) {
  const heights = new Float32Array(width * height)

  for (let row = 0; row < height; row++) {
    const v = row / Math.max(1, height - 1)
    const lat = bbox.north + (bbox.south - bbox.north) * v
    for (let col = 0; col < width; col++) {
      const u = col / Math.max(1, width - 1)
      const lon = bbox.west + (bbox.east - bbox.west) * u
      const land = sampleLand(lat, lon)
      const macro = fbm((lon + 180) * 0.06 + focus.lon * 0.014, (lat + 90) * 0.06 - focus.lat * 0.012, 4)
      const ridge = ridged((lon + 180) * 0.22 - focus.lat * 0.025, (lat + 90) * 0.22 + focus.lon * 0.02, 4)
      const detail = fbm((lon + 180) * 0.72 + focus.lon * 0.038, (lat + 90) * 0.72 - focus.lat * 0.035, 2)
      const polar = Math.pow(Math.abs(lat) / 90, 1.8)

      heights[row * width + col] = land
        ? 40 + macro * 520 + ridge * 1180 + detail * 180 + polar * ridge * 190
        : -180 - macro * 260 - ridge * 940 - detail * 120
    }
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col
      if (!sampleLand(
        bbox.north + (bbox.south - bbox.north) * (row / Math.max(1, height - 1)),
        bbox.west + (bbox.east - bbox.west) * (col / Math.max(1, width - 1)),
      )) {
        continue
      }

      let coastalNeighbors = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = clamp(col + dx, 0, width - 1)
          const ny = clamp(row + dy, 0, height - 1)
          const nv = ny / Math.max(1, height - 1)
          const nu = nx / Math.max(1, width - 1)
          const nLat = bbox.north + (bbox.south - bbox.north) * nv
          const nLon = bbox.west + (bbox.east - bbox.west) * nu
          if (!sampleLand(nLat, nLon)) coastalNeighbors += 1
        }
      }

      if (coastalNeighbors > 0) {
        const eased = mix(0.28, 0.62, clamp(coastalNeighbors / 5, 0, 1))
        heights[index] = Math.max(12, heights[index] * eased)
      }
    }
  }

  return heights
}

function createSyntheticTerrainSample(
  focus: WorldFocus,
  preset: TerrainPreset,
  preview = false,
): TerrainSample {
  const sampleResolution = preview ? previewResolution(preset.sampleResolution) : preset.sampleResolution
  const spanDeg = preview ? Math.max(0.42, preset.spanDeg * 0.84) : preset.spanDeg
  const bbox = makeBBox(focus.lat, focus.lon, spanDeg)
  const heightMeters = buildSyntheticHeights(focus, bbox, sampleResolution, sampleResolution)

  return {
    key: `${makeFocusId(preview ? 'preview' : 'synthetic', focus.lat, focus.lon)}:${sampleResolution}:${round(spanDeg, 3)}`,
    source: 'synthetic',
    bbox,
    width: sampleResolution,
    height: sampleResolution,
    heightMeters,
    waterMask: buildWaterMask(bbox, sampleResolution, sampleResolution, heightMeters),
    resolution: bboxResolutionMeters(bbox, sampleResolution),
  }
}

type MapTilerFeature = {
  id?: string | number
  text?: string
  place_name?: string
  center?: [number, number]
  properties?: {
    country?: string
    short_code?: string
  }
  context?: Array<{ id?: string; text?: string }>
}

type TileJson = {
  tiles?: string[]
}

let terrainTemplatePromise: Promise<string | null> | null = null

function round(value: number, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function makeFocusId(prefix: string, lat: number, lon: number) {
  return `${prefix}:${round(lat, 3)}:${round(lon, 3)}`
}

function focusCacheKey(focus: WorldFocus, mode: Extract<WorldSceneMode, 'region' | 'ground'>, quality: WorldQuality) {
  return `${mode}:${quality}:${round(focus.lat, 3)}:${round(focus.lon, 3)}`
}

function makeBBox(lat: number, lon: number, spanDeg: number): TerrainBBox {
  const latHalf = spanDeg * 0.5
  const lonScale = 1 / Math.max(0.32, Math.cos((lat * Math.PI) / 180))
  const lonHalf = latHalf * lonScale
  return {
    west: lon - lonHalf,
    east: lon + lonHalf,
    south: clamp(lat - latHalf, -84, 84),
    north: clamp(lat + latHalf, -84, 84),
  }
}

function bboxResolutionMeters(bbox: TerrainBBox, samples: number) {
  const latMeters = (bbox.north - bbox.south) * 111_000
  return Math.max(1, Math.round(latMeters / Math.max(1, samples - 1)))
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`http ${response.status}`)
  return response.json() as Promise<T>
}

function normalizeOpenMeteoPlace(row: {
  id?: number
  name?: string
  country?: string
  timezone?: string
  latitude: number
  longitude: number
  elevation?: number
}): PlaceResult {
  const label = row.name || `${row.latitude.toFixed(2)}, ${row.longitude.toFixed(2)}`
  return {
    id: row.id != null ? `open-meteo:${row.id}` : makeFocusId('open-meteo', row.latitude, row.longitude),
    lat: row.latitude,
    lon: row.longitude,
    zoom: 2.6,
    label,
    country: row.country,
    timezone: row.timezone,
    elevation: row.elevation,
    source: 'open-meteo',
  }
}

function countryFromContext(feature: MapTilerFeature): string | undefined {
  if (feature.properties?.country) return feature.properties.country
  const country = feature.context?.find((entry) => entry.id?.startsWith('country'))
  return country?.text
}

function normalizeMapTilerPlace(feature: MapTilerFeature): PlaceResult | null {
  const center = feature.center
  if (!center || center.length < 2) return null
  const label = feature.place_name || feature.text
  if (!label) return null
  return {
    id: feature.id != null ? `maptiler:${feature.id}` : makeFocusId('maptiler', center[1], center[0]),
    lat: center[1],
    lon: center[0],
    zoom: 2.8,
    label,
    country: countryFromContext(feature),
    source: 'maptiler',
  }
}

function fallbackPlace(lat: number, lon: number): PlaceResult {
  return {
    id: makeFocusId('fallback', lat, lon),
    lat,
    lon,
    zoom: 2.4,
    label: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
    country: sampleLand(lat, lon) ? 'land' : 'open ocean',
    source: 'fallback',
  }
}

function manhattanPlaceResult(
  focus: Partial<WorldFocus> = {},
  source: PlaceResult['source'] = 'fallback',
): PlaceResult {
  const normalized = normalizeManhattanFocus(focus)
  return {
    id: 'pirte:manhattan',
    lat: normalized.lat,
    lon: normalized.lon,
    zoom: normalized.zoom,
    label: normalized.label || 'Manhattan',
    country: normalized.country,
    timezone: normalized.timezone,
    elevation: normalized.elevation,
    source,
  }
}

function prependManhattanResult(query: string, results: PlaceResult[]) {
  const normalized = query.trim().toLowerCase()
  const wantsManhattan =
    normalized.includes('manhattan') ||
    normalized.includes('new york') ||
    normalized.includes('nyc')
  if (!wantsManhattan) return results
  if (results.some((entry) => isNearManhattan(entry.lat, entry.lon))) return results
  return [manhattanPlaceResult({ label: 'Manhattan' }), ...results]
}

async function cachedValue<T>(
  bucket: string,
  key: string,
  memory: LruCache<T>,
  ttlMs: number,
  validate: ((value: unknown) => value is T) | null,
  loader: () => Promise<T>,
): Promise<T> {
  const hot = memory.get(key)
  if (hot) return hot

  const warm = await readPersistent<T>(bucket, key)
  if (warm && (!validate || validate(warm))) {
    memory.set(key, warm)
    return warm
  }

  const value = await loader()
  memory.set(key, value)
  void writePersistent(bucket, key, value, ttlMs)
  return value
}

function isPlaceResultArray(value: unknown): value is PlaceResult[] {
  return Array.isArray(value) && value.every((entry) =>
    entry != null &&
    typeof entry === 'object' &&
    Number.isFinite((entry as PlaceResult).lat) &&
    Number.isFinite((entry as PlaceResult).lon) &&
    typeof (entry as PlaceResult).id === 'string',
  )
}

function isPlaceResult(value: unknown): value is PlaceResult {
  return value != null &&
    typeof value === 'object' &&
    Number.isFinite((value as PlaceResult).lat) &&
    Number.isFinite((value as PlaceResult).lon) &&
    typeof (value as PlaceResult).id === 'string'
}

function isWeatherSignals(value: unknown): value is WeatherSignals {
  return value != null &&
    typeof value === 'object' &&
    'fetchedAt' in (value as WeatherSignals)
}

function isTerrainSample(value: unknown): value is TerrainSample {
  const sample = value as TerrainSample
  const size = Number(sample?.width) * Number(sample?.height)
  return value != null &&
    typeof value === 'object' &&
    value !== null &&
    typeof sample.key === 'string' &&
    Number.isFinite(sample.width) &&
    Number.isFinite(sample.height) &&
    Number.isFinite(sample.resolution) &&
    sample.heightMeters instanceof Float32Array &&
    sample.waterMask instanceof Uint8Array &&
    Number.isFinite(size) &&
    sample.heightMeters.length === size &&
    sample.waterMask.length === size
}

function isStationArray(value: unknown): value is Station[] {
  return Array.isArray(value) && value.every((entry) =>
    entry != null &&
    typeof entry === 'object' &&
    typeof (entry as Station).id === 'string' &&
    typeof (entry as Station).url === 'string',
  )
}

async function mapTilerSearch(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json` +
    `?language=en&limit=6&fuzzyMatch=true&key=${encodeURIComponent(MAPTILER_KEY)}`
  const data = await fetchJson<{ features?: MapTilerFeature[] }>(url, signal)
  return (data.features || [])
    .map(normalizeMapTilerPlace)
    .filter((entry): entry is PlaceResult => entry != null)
}

async function mapTilerReverse(lat: number, lon: number, signal?: AbortSignal): Promise<PlaceResult | null> {
  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(`${lon},${lat}`)}.json` +
    `?limit=1&language=en&key=${encodeURIComponent(MAPTILER_KEY)}`
  const data = await fetchJson<{ features?: MapTilerFeature[] }>(url, signal)
  const first = data.features?.[0]
  return first ? normalizeMapTilerPlace(first) : null
}

function mercatorWorldPixel(lat: number, lon: number, zoom: number) {
  const sin = Math.sin((clamp(lat, -85, 85) * Math.PI) / 180)
  const scale = 256 * 2 ** zoom
  return {
    x: ((normalizeLon(lon) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function tileFor(lat: number, lon: number, zoom: number) {
  const world = mercatorWorldPixel(lat, lon, zoom)
  return {
    x: Math.floor(world.x / 256),
    y: Math.floor(world.y / 256),
  }
}

function bilinearSample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const x0 = clamp(Math.floor(x), 0, width - 1)
  const y0 = clamp(Math.floor(y), 0, height - 1)
  const x1 = clamp(x0 + 1, 0, width - 1)
  const y1 = clamp(y0 + 1, 0, height - 1)
  const tx = clamp(x - x0, 0, 1)
  const ty = clamp(y - y0, 0, 1)

  const sample = (sx: number, sy: number) => {
    const index = (sy * width + sx) * 4
    return [
      data[index],
      data[index + 1],
      data[index + 2],
    ] as const
  }

  const c00 = sample(x0, y0)
  const c10 = sample(x1, y0)
  const c01 = sample(x0, y1)
  const c11 = sample(x1, y1)

  const mix = (a: number, b: number, t: number) => a + (b - a) * t
  const r0 = mix(c00[0], c10[0], tx)
  const g0 = mix(c00[1], c10[1], tx)
  const b0 = mix(c00[2], c10[2], tx)
  const r1 = mix(c01[0], c11[0], tx)
  const g1 = mix(c01[1], c11[1], tx)
  const b1 = mix(c01[2], c11[2], tx)

  return [
    mix(r0, r1, ty),
    mix(g0, g1, ty),
    mix(b0, b1, ty),
  ] as const
}

function decodeTerrainHeight(rgb: readonly [number, number, number]) {
  return -10_000 + ((rgb[0] * 256 * 256 + rgb[1] * 256 + rgb[2]) * 0.1)
}

async function getTerrainTemplate(signal?: AbortSignal): Promise<string | null> {
  if (!MAPTILER_KEY) return null
  if (!terrainTemplatePromise) {
    terrainTemplatePromise = fetchJson<TileJson>(
      `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      signal,
    ).then((data) => data.tiles?.[0] || null)
      .catch(() => null)
  }
  return terrainTemplatePromise
}

async function loadImageData(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`http ${response.status}`)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('terrain canvas unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function buildWaterMask(bbox: TerrainBBox, width: number, height: number, heights: Float32Array) {
  const waterMask = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    const v = row / Math.max(1, height - 1)
    const lat = bbox.north + (bbox.south - bbox.north) * v
    for (let col = 0; col < width; col++) {
      const u = col / Math.max(1, width - 1)
      const lon = bbox.west + (bbox.east - bbox.west) * u
      const index = row * width + col
      const land = sampleLand(lat, lon)
      waterMask[index] = !land || heights[index] < 8 ? 1 : 0
    }
  }
  return waterMask
}

async function loadMapTilerTerrainSample(
  focus: WorldFocus,
  preset: TerrainPreset,
  signal?: AbortSignal,
): Promise<TerrainSample | null> {
  const template = await getTerrainTemplate(signal)
  if (!template) return null

  const bbox = makeBBox(focus.lat, focus.lon, preset.spanDeg)
  const tile = tileFor(focus.lat, focus.lon, preset.zoom)
  const url = template
    .replace('{z}', String(preset.zoom))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))

  const image = await loadImageData(url, signal)
  const heights = new Float32Array(preset.sampleResolution * preset.sampleResolution)
  const tileOriginX = tile.x * 256
  const tileOriginY = tile.y * 256

  for (let row = 0; row < preset.sampleResolution; row++) {
    const v = row / Math.max(1, preset.sampleResolution - 1)
    const lat = bbox.north + (bbox.south - bbox.north) * v
    for (let col = 0; col < preset.sampleResolution; col++) {
      const u = col / Math.max(1, preset.sampleResolution - 1)
      const lon = bbox.west + (bbox.east - bbox.west) * u
      const world = mercatorWorldPixel(lat, lon, preset.zoom)
      const px = world.x - tileOriginX
      const py = world.y - tileOriginY
      if (px < 0 || py < 0 || px > 255 || py > 255) return null
      heights[row * preset.sampleResolution + col] = decodeTerrainHeight(
        bilinearSample(image.data, image.width, image.height, px, py),
      )
    }
  }

  return {
    key: `${makeFocusId('maptiler', focus.lat, focus.lon)}:${preset.zoom}:${preset.sampleResolution}`,
    source: 'maptiler',
    bbox,
    width: preset.sampleResolution,
    height: preset.sampleResolution,
    heightMeters: heights,
    waterMask: buildWaterMask(bbox, preset.sampleResolution, preset.sampleResolution, heights),
    resolution: bboxResolutionMeters(bbox, preset.sampleResolution),
  }
}

async function fetchElevationBatch(points: Array<{ lat: number; lon: number }>, signal?: AbortSignal) {
  const latitude = points.map((point) => point.lat.toFixed(5)).join(',')
  const longitude = points.map((point) => point.lon.toFixed(5)).join(',')
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`
  const data = await fetchJson<{ elevation?: number[] }>(url, signal)
  return data.elevation || []
}

async function loadOpenMeteoTerrainSample(
  focus: WorldFocus,
  preset: TerrainPreset,
  signal?: AbortSignal,
): Promise<TerrainSample> {
  const bbox = makeBBox(focus.lat, focus.lon, preset.spanDeg)
  const fallbackHeights = buildSyntheticHeights(focus, bbox, preset.sampleResolution, preset.sampleResolution)
  const points: Array<{ lat: number; lon: number }> = []

  for (let row = 0; row < preset.sampleResolution; row++) {
    const v = row / Math.max(1, preset.sampleResolution - 1)
    const lat = bbox.north + (bbox.south - bbox.north) * v
    for (let col = 0; col < preset.sampleResolution; col++) {
      const u = col / Math.max(1, preset.sampleResolution - 1)
      const lon = bbox.west + (bbox.east - bbox.west) * u
      points.push({ lat, lon })
    }
  }

  const heightMeters = new Float32Array(points.length)
  let cursor = 0
  for (let index = 0; index < points.length; index += OPEN_METEO_BATCH_SIZE) {
    const chunk = points.slice(index, index + OPEN_METEO_BATCH_SIZE)
    let values: number[] = []
    try {
      values = await fetchElevationBatch(chunk, signal)
    } catch {
      values = []
    }
    for (let offset = 0; offset < chunk.length; offset++) {
      const value = values[offset]
      heightMeters[cursor] = Number.isFinite(value) ? value : fallbackHeights[cursor]
      cursor += 1
    }
  }

  return {
    key: `${makeFocusId('open-meteo', focus.lat, focus.lon)}:${preset.sampleResolution}`,
    source: 'open-meteo',
    bbox,
    width: preset.sampleResolution,
    height: preset.sampleResolution,
    heightMeters,
    waterMask: buildWaterMask(bbox, preset.sampleResolution, preset.sampleResolution, heightMeters),
    resolution: bboxResolutionMeters(bbox, preset.sampleResolution),
  }
}

function haversineKm(latA: number, lonA: number, latB: number, lonB: number) {
  const rad = Math.PI / 180
  const dLat = (latB - latA) * rad
  const dLon = (lonB - lonA) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

function stationScore(station: Station) {
  return station.clickcount * 0.8 + station.votes * 0.5 + station.bitrate * 0.06
}

function pagesForQuality(quality: WorldQuality) {
  if (SAVE_DATA) return 2
  if (quality === 'cinematic') return 5
  if (quality === 'balanced') return 3
  return 2
}

function createPlaceProvider(): PlaceProvider {
  return {
    async search(query, signal) {
      const trimmed = query.trim()
      if (trimmed.length < 2) return []
      const cacheKey = trimmed.toLowerCase()
      return cachedValue('places', cacheKey, placeCache, PLACE_TTL_MS, isPlaceResultArray, async () => {
        if (MAPTILER_KEY) {
          try {
            const results = await mapTilerSearch(trimmed, signal)
            if (results.length > 0) return prependManhattanResult(trimmed, results)
          } catch {
            // fall through
          }
        }
        const url =
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}` +
          '&count=8&language=en&format=json'
        const data = await fetchJson<{ results?: Array<{
          id?: number
          name?: string
          country?: string
          timezone?: string
          latitude: number
          longitude: number
          elevation?: number
        }> }>(url, signal)
        return prependManhattanResult(trimmed, (data.results || []).map(normalizeOpenMeteoPlace))
      })
    },

    async reverse(lat, lon, signal) {
      const cacheKey = `${round(lat, 3)}:${round(lon, 3)}`
      return cachedValue('reverse', cacheKey, reversePlaceCache, PLACE_TTL_MS, isPlaceResult, async () => {
        if (isNearManhattan(lat, lon)) {
          return manhattanPlaceResult({ lat, lon, label: 'Manhattan' })
        }
        if (MAPTILER_KEY) {
          try {
            const place = await mapTilerReverse(lat, lon, signal)
            if (place) return place
          } catch {
            // fall through
          }
        }
        return fallbackPlace(lat, lon)
      })
    },
  }
}

function createWeatherProvider(): WeatherProvider {
  return {
    async readFocus(focus, signal) {
      const cacheKey = `${round(focus.lat, 2)}:${round(focus.lon, 2)}`
      return cachedValue('weather', cacheKey, weatherCache, WEATHER_TTL_MS, isWeatherSignals, async () => {
        const forecastUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${focus.lat}&longitude=${focus.lon}` +
          '&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code'
        const marineUrl =
          `https://marine-api.open-meteo.com/v1/marine?latitude=${focus.lat}&longitude=${focus.lon}` +
          '&current=wave_height,ocean_current_velocity,ocean_current_direction,sea_level_height_msl'
        const floodUrl =
          `https://flood-api.open-meteo.com/v1/flood?latitude=${focus.lat}&longitude=${focus.lon}` +
          '&daily=river_discharge&forecast_days=1'

        const [forecast, marine, flood] = await Promise.allSettled([
          fetchJson<{ current?: {
            temperature_2m?: number
            wind_speed_10m?: number
            wind_direction_10m?: number
            weather_code?: number
          } }>(forecastUrl, signal),
          fetchJson<{ current?: {
            wave_height?: number
            ocean_current_velocity?: number
            ocean_current_direction?: number
            sea_level_height_msl?: number
          } }>(marineUrl, signal),
          fetchJson<{ daily?: { river_discharge?: number[] } }>(floodUrl, signal),
        ])

        const currentForecast = forecast.status === 'fulfilled' ? forecast.value.current : undefined
        const currentMarine = marine.status === 'fulfilled' ? marine.value.current : undefined
        const currentFlood = flood.status === 'fulfilled' ? flood.value.daily?.river_discharge?.[0] : undefined

        return {
          temperatureC: currentForecast?.temperature_2m ?? null,
          windSpeedKph: currentForecast?.wind_speed_10m ?? null,
          windDirectionDeg: currentForecast?.wind_direction_10m ?? null,
          weatherCode: currentForecast?.weather_code ?? null,
          waveHeightM: currentMarine?.wave_height ?? null,
          currentSpeedMs: currentMarine?.ocean_current_velocity ?? null,
          currentDirectionDeg: currentMarine?.ocean_current_direction ?? null,
          seaLevelM: currentMarine?.sea_level_height_msl ?? null,
          riverDischargeM3s: currentFlood ?? null,
          fetchedAt: new Date().toISOString(),
        }
      })
    },
  }
}

function createTerrainProvider(): TerrainProvider {
  return {
    previewPatch(focus, mode, quality) {
      const preset = TERRAIN_PRESETS[quality][mode]
      return createSyntheticTerrainSample(focus, preset, true)
    },

    async loadPatch(focus, mode, quality, signal) {
      const preset = TERRAIN_PRESETS[quality][mode]
      const cacheKey = focusCacheKey(focus, mode, quality)
      return cachedValue('terrain', cacheKey, terrainCache, TERRAIN_TTL_MS, isTerrainSample, async () => {
        if (MAPTILER_KEY) {
          try {
            const remote = await loadMapTilerTerrainSample(focus, preset, signal)
            if (remote) return remote
          } catch {
            // fall back cleanly
          }
        }
        try {
          return await loadOpenMeteoTerrainSample(focus, preset, signal)
        } catch {
          return createSyntheticTerrainSample(focus, preset)
        }
      })
    },
  }
}

function createRadioProvider(): RadioProvider {
  let seedPromise: Promise<Station[]> | null = null

  const ensureSeed = async (quality: WorldQuality, signal?: AbortSignal) => {
    const key = `seed:${quality}:${pagesForQuality(quality)}`
    const hot = radioSeedCache.get(key)
    if (hot) return hot
    if (seedPromise) return seedPromise

    seedPromise = cachedValue('radio-seed', key, radioSeedCache, RADIO_TTL_MS, isStationArray, async () => {
      const pages = pagesForQuality(quality)
      return fetchStationsPaged({ order: 'clickcount' }, pages, 350, signal)
    }).finally(() => {
      seedPromise = null
    })

    return seedPromise
  }

  return {
    seed(quality, signal) {
      return ensureSeed(quality, signal)
    },

    async nearby(lat, lon, signal) {
      const stations = await ensureSeed('balanced', signal)
      const ranked = stations
        .map((station) => ({
          station,
          distanceKm: haversineKm(lat, lon, station.lat, station.lon),
        }))
        .sort((a, b) => {
          const ad = a.distanceKm / 900
          const bd = b.distanceKm / 900
          return (ad - stationScore(a.station) * 0.0015) - (bd - stationScore(b.station) * 0.0015)
        })

      const tight = ranked.filter((entry) => entry.distanceKm < 1200).slice(0, 10)
      if (tight.length >= 6) return tight.map((entry) => entry.station)
      return ranked.slice(0, 10).map((entry) => entry.station)
    },
  }
}

export function createWorldProviders(): WorldProviders {
  return {
    terrain: createTerrainProvider(),
    places: createPlaceProvider(),
    weather: createWeatherProvider(),
    radio: createRadioProvider(),
  }
}

export function createWorldHomeProviders() {
  return {
    terrain: createTerrainProvider(),
    places: createPlaceProvider(),
    weather: createWeatherProvider(),
  }
}
