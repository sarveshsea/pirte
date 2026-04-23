import {
  CITY_BRICK_CELLS,
  CITY_CELL_METERS,
  CITY_GRID_HEIGHT,
  CITY_GRID_WIDTH,
  MANHATTAN_BOUNDS,
  MANHATTAN_CENTER,
  METERS_PER_WORLD_UNIT,
} from './constants'
import { clamp, mix } from './geo'
import type { BrickPhase, CityId, VoxelBrickId, WorldFocus, WorldQuality, WorldSceneMode } from './types'

export const MANHATTAN_CITY_ID: CityId = 'manhattan'

export const MANHATTAN_FOCUS: WorldFocus = {
  kind: 'city',
  city: MANHATTAN_CITY_ID,
  lat: MANHATTAN_CENTER.lat,
  lon: MANHATTAN_CENTER.lon,
  zoom: 11.6,
  label: 'Manhattan',
  country: 'United States',
}

export type ManhattanCell = {
  terrainHeight: number
  structureHeight: number
  land: boolean
  road: boolean
  park: boolean
  water: boolean
}

type StreamPhase = {
  phase: BrickPhase
  lod: number
  ids: VoxelBrickId[]
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function gaussian(value: number, center: number, width: number) {
  const d = (value - center) / Math.max(0.0001, width)
  return Math.exp(-d * d)
}

function fract(value: number) {
  return value - Math.floor(value)
}

function hash2(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
}

export function isNearManhattan(lat: number, lon: number) {
  return (
    lat >= MANHATTAN_BOUNDS.south &&
    lat <= MANHATTAN_BOUNDS.north &&
    lon >= MANHATTAN_BOUNDS.west &&
    lon <= MANHATTAN_BOUNDS.east
  )
}

export function isManhattanFocus(focus: WorldFocus | null) {
  if (!focus) return false
  return focus.city === MANHATTAN_CITY_ID || isNearManhattan(focus.lat, focus.lon)
}

export function normalizeManhattanFocus(focus?: Partial<WorldFocus> | null): WorldFocus {
  if (!focus) return { ...MANHATTAN_FOCUS }
  return {
    ...MANHATTAN_FOCUS,
    ...focus,
    kind: focus.kind ?? 'city',
    city: MANHATTAN_CITY_ID,
    label: focus.label || MANHATTAN_FOCUS.label,
  }
}

export function manhattanGridFromLatLon(lat: number, lon: number) {
  const u = clamp((lon - MANHATTAN_BOUNDS.west) / (MANHATTAN_BOUNDS.east - MANHATTAN_BOUNDS.west), 0, 1)
  const v = clamp((lat - MANHATTAN_BOUNDS.south) / (MANHATTAN_BOUNDS.north - MANHATTAN_BOUNDS.south), 0, 1)
  return {
    x: Math.round(u * (CITY_GRID_WIDTH - 1)),
    z: Math.round(v * (CITY_GRID_HEIGHT - 1)),
  }
}

export function latLonFromManhattanGrid(x: number, z: number) {
  const u = clamp(x / Math.max(1, CITY_GRID_WIDTH - 1), 0, 1)
  const v = clamp(z / Math.max(1, CITY_GRID_HEIGHT - 1), 0, 1)
  return {
    lat: mix(MANHATTAN_BOUNDS.south, MANHATTAN_BOUNDS.north, v),
    lon: mix(MANHATTAN_BOUNDS.west, MANHATTAN_BOUNDS.east, u),
  }
}

export function manhattanLocalFromLatLon(lat: number, lon: number) {
  const grid = manhattanGridFromLatLon(lat, lon)
  return {
    x: ((grid.x - CITY_GRID_WIDTH * 0.5) * CITY_CELL_METERS) / METERS_PER_WORLD_UNIT,
    z: ((grid.z - CITY_GRID_HEIGHT * 0.5) * CITY_CELL_METERS) / METERS_PER_WORLD_UNIT,
  }
}

function cityHalfWidth(zNorm: number) {
  const southBulge = gaussian(zNorm, 0.10, 0.12) * 0.17
  const midBulge = gaussian(zNorm, 0.46, 0.18) * 0.23
  const northBulge = gaussian(zNorm, 0.80, 0.14) * 0.16
  const taper = 0.09 + southBulge + midBulge + northBulge
  return clamp(taper, 0.08, 0.26)
}

function cityCenterline(zNorm: number) {
  return 0.5 + Math.sin(zNorm * 4.4 - 0.8) * 0.02 + Math.sin(zNorm * 10.6 + 1.2) * 0.006
}

export function sampleManhattanCell(baseX: number, baseZ: number): ManhattanCell {
  const xNorm = baseX / Math.max(1, CITY_GRID_WIDTH - 1)
  const zNorm = baseZ / Math.max(1, CITY_GRID_HEIGHT - 1)

  const centerline = cityCenterline(zNorm)
  const halfWidth = cityHalfWidth(zNorm)
  const distToCenter = Math.abs(xNorm - centerline)
  const shorelineBlend = 1 - smoothstep(halfWidth - 0.02, halfWidth + 0.015, distToCenter)
  const land = shorelineBlend > 0.02
  const water = !land

  const park = land &&
    zNorm > 0.52 &&
    zNorm < 0.70 &&
    Math.abs(xNorm - centerline) < halfWidth * 0.48

  const broadway = Math.abs((xNorm - centerline) - (0.12 - zNorm * 0.26)) < 0.013
  const avenueIndex = Math.round((xNorm - centerline + 0.26) / 0.032)
  const avenueCenter = centerline - 0.26 + avenueIndex * 0.032
  const avenue = Math.abs(xNorm - avenueCenter) < 0.007 && avenueIndex >= 0 && avenueIndex <= 16

  const crossSpacing = zNorm < 0.22 ? 0.012 : zNorm < 0.48 ? 0.0105 : 0.0115
  const crossOffset = zNorm < 0.22 ? 0.004 : 0.0015
  const streetPulse = Math.abs(((zNorm + crossOffset) / crossSpacing) - Math.round((zNorm + crossOffset) / crossSpacing))
  const street = land && streetPulse < 0.07

  const waterfront = land && shorelineBlend < 0.22
  const road = land && !park && (avenue || street || broadway || waterfront)

  const terrainBase =
    1 +
    gaussian(zNorm, 0.08, 0.1) * 2 +
    gaussian(zNorm, 0.62, 0.22) * 3 +
    gaussian(zNorm, 0.84, 0.12) * 1.8
  const terrainRipple = hash2(baseX * 0.18, baseZ * 0.18) * 1.4
  const terrainHeight = land ? Math.max(1, Math.round(terrainBase + terrainRipple * shorelineBlend)) : 0

  if (!land || road || park) {
    return {
      terrainHeight,
      structureHeight: 0,
      land,
      road,
      park,
      water,
    }
  }

  const district =
    gaussian(zNorm, 0.10, 0.08) * 0.95 +
    gaussian(zNorm, 0.42, 0.08) * 1.45 +
    gaussian(zNorm, 0.62, 0.12) * 0.62
  const blockNoise = hash2(baseX * 0.12 + 17.4, baseZ * 0.12 - 9.1)
  const towerNoise = hash2(baseX * 0.043 + 81.2, baseZ * 0.043 + 12.7)
  const shoulder = smoothstep(0.05, 0.2, shorelineBlend)
  const presence = district * 0.66 + blockNoise * 0.34

  if (presence < 0.34) {
    return {
      terrainHeight,
      structureHeight: 0,
      land,
      road,
      park,
      water,
    }
  }

  let structureHeight =
    3 +
    Math.round(district * 18 + blockNoise * 8 + shoulder * 3)

  if (towerNoise > 0.82) structureHeight += Math.round(10 + towerNoise * 20)
  if (zNorm > 0.50 && zNorm < 0.70 && towerNoise < 0.38) structureHeight = Math.max(2, structureHeight - 4)
  if (waterfront) structureHeight = Math.max(2, structureHeight - 3)

  return {
    terrainHeight,
    structureHeight: clamp(structureHeight, 0, 42),
    land,
    road,
    park,
    water,
  }
}

function lodStride(lod: number) {
  return lod === 0 ? 1 : lod === 1 ? 4 : 8
}

function qualityNeighborhoodRadius(quality: WorldQuality, mode: Extract<WorldSceneMode, 'region' | 'ground'>) {
  if (mode === 'ground') {
    if (quality === 'cinematic') return { x: 4, z: 7 }
    if (quality === 'balanced') return { x: 3, z: 6 }
    return { x: 2, z: 4 }
  }
  if (quality === 'cinematic') return { x: 3, z: 5 }
  if (quality === 'balanced') return { x: 2, z: 4 }
  return { x: 2, z: 3 }
}

function qualityDetailRadius(quality: WorldQuality, mode: Extract<WorldSceneMode, 'region' | 'ground'>) {
  if (mode === 'ground') {
    if (quality === 'cinematic') return { x: 3, z: 6 }
    if (quality === 'balanced') return { x: 3, z: 5 }
    return { x: 2, z: 3 }
  }
  if (quality === 'cinematic') return { x: 2, z: 4 }
  if (quality === 'balanced') return { x: 2, z: 3 }
  return { x: 1, z: 2 }
}

function brickRangeForCity(lod: number) {
  const stride = lodStride(lod)
  const span = CITY_BRICK_CELLS * stride
  return {
    width: Math.ceil(CITY_GRID_WIDTH / span),
    height: Math.ceil(CITY_GRID_HEIGHT / span),
  }
}

function idsAround(centerX: number, centerZ: number, lod: number, radiusX: number, radiusZ: number, phase: BrickPhase) {
  const stride = lodStride(lod)
  const span = CITY_BRICK_CELLS * stride
  const cx = Math.floor(centerX / span)
  const cz = Math.floor(centerZ / span)
  const range = brickRangeForCity(lod)
  const ids: VoxelBrickId[] = []

  for (let z = cz - radiusZ; z <= cz + radiusZ; z++) {
    for (let x = cx - radiusX; x <= cx + radiusX; x++) {
      if (x < 0 || z < 0 || x >= range.width || z >= range.height) continue
      ids.push({ city: MANHATTAN_CITY_ID, lod, x, y: 0, z })
    }
  }

  ids.sort((a, b) => {
    const ad = Math.abs(a.x - cx) + Math.abs(a.z - cz)
    const bd = Math.abs(b.x - cx) + Math.abs(b.z - cz)
    if (ad !== bd) return ad - bd
    if (phase === 'coarse') return a.z - b.z || a.x - b.x
    return a.x - b.x || a.z - b.z
  })
  return ids
}

export function buildManhattanStreamPlan(
  focus: WorldFocus,
  quality: WorldQuality,
  mode: Extract<WorldSceneMode, 'region' | 'ground'>,
): StreamPhase[] {
  const center = manhattanGridFromLatLon(focus.lat, focus.lon)
  const coarseRange = brickRangeForCity(2)
  const coarse: VoxelBrickId[] = []
  for (let z = 0; z < coarseRange.height; z++) {
    for (let x = 0; x < coarseRange.width; x++) {
      coarse.push({ city: MANHATTAN_CITY_ID, lod: 2, x, y: 0, z })
    }
  }

  return [
    { phase: 'coarse', lod: 2, ids: coarse },
    {
      phase: 'neighborhood',
      lod: 1,
      ids: idsAround(center.x, center.z, 1, qualityNeighborhoodRadius(quality, mode).x, qualityNeighborhoodRadius(quality, mode).z, 'neighborhood'),
    },
    {
      phase: 'detail',
      lod: 0,
      ids: idsAround(center.x, center.z, 0, qualityDetailRadius(quality, mode).x, qualityDetailRadius(quality, mode).z, 'detail'),
    },
  ]
}
