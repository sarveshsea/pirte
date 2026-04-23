import type { Station } from '../radio/api'

export type WorldSceneMode = 'orbit' | 'region' | 'ground'
export type WorldVisualMode = 'hybrid' | 'light' | 'ascii'
export type WorldQuality = 'low' | 'balanced' | 'cinematic'
export type WorldFocusKind = 'planet' | 'city' | 'district'
export type CityId = 'manhattan'
export type BrickPhase = 'coarse' | 'neighborhood' | 'detail'

export type TerrainBBox = {
  west: number
  south: number
  east: number
  north: number
}

export type WorldFocus = {
  kind?: WorldFocusKind
  city?: CityId | null
  lat: number
  lon: number
  zoom: number
  label?: string
  country?: string
  timezone?: string
  elevation?: number
}

export type PlaceResult = WorldFocus & {
  id: string
  source: 'maptiler' | 'open-meteo' | 'fallback'
}

export type WeatherSignals = {
  temperatureC: number | null
  windSpeedKph: number | null
  windDirectionDeg: number | null
  weatherCode: number | null
  waveHeightM: number | null
  currentSpeedMs: number | null
  currentDirectionDeg: number | null
  seaLevelM: number | null
  riverDischargeM3s: number | null
  fetchedAt: string
}

export type TerrainSample = {
  key: string
  source: 'maptiler' | 'open-meteo' | 'synthetic'
  bbox: TerrainBBox
  width: number
  height: number
  heightMeters: Float32Array
  waterMask: Uint8Array
  resolution: number
}

export type ChunkCoord = {
  x: number
  y: number
  z: number
}

export type VoxelChunk = {
  coord: ChunkCoord
  size: [number, number, number]
  occupancy: Uint8Array
  material: Uint8Array
  water: Float32Array
  lod: number
}

export type ChunkMesh = {
  coord: ChunkCoord
  terrainPositions: Float32Array
  terrainNormals: Float32Array
  terrainIndices: Uint16Array
  terrainColors: Float32Array
  emissivePositions: Float32Array
  emissiveNormals: Float32Array
  emissiveIndices: Uint16Array
  emissiveColors: Float32Array
  waterPositions: Float32Array
  waterNormals: Float32Array
  waterIndices: Uint16Array
  waterColors: Float32Array
}

export type TerrainPatch = {
  key: string
  source: TerrainSample['source']
  bbox: TerrainBBox
  gridSize: [number, number]
  chunkSize: [number, number, number]
  resolution: number
  elevationMin: number
  elevationMax: number
  waterMask: Uint8Array
  water: Float32Array
  chunks: VoxelChunk[]
  meshes: ChunkMesh[]
  ascii: string
}

export type WaterMeshUpdate = {
  key: string
  water: Float32Array
  ascii: string
  meshes: Array<Pick<ChunkMesh, 'coord' | 'waterPositions' | 'waterNormals' | 'waterIndices' | 'waterColors'>>
}

export type WaterDisturbance = {
  x: number
  y: number
  radius: number
  strength: number
}

export type ProjectedMarker = {
  id: string
  x: number
  y: number
  z: number
  label: string
  accent?: string
}

export type WorldLocationMarker = Pick<WorldFocus, 'lat' | 'lon'> & {
  id: string
  label: string
  accent?: string
}

export type CelestialState = {
  sunDir: [number, number, number]
  siderealAngle: number
  exposure: number
}

export type VoxelBrickId = {
  city: CityId
  lod: number
  x: number
  y: number
  z: number
}

export type VoxelBrickBounds = {
  min: [number, number, number]
  max: [number, number, number]
}

export type VoxelBrick = {
  id: VoxelBrickId
  phase: BrickPhase
  bounds: VoxelBrickBounds
  voxelScale: number
  voxels: Float32Array
  materials: Float32Array
  lighting: Float32Array
  water: Float32Array
  waterLighting: Float32Array
  waterColors: Float32Array
  sourceMask: number
  kindCounts: {
    terrain: number
    structures: number
    roads: number
    parks: number
    water: number
  }
}

export type BrickStreamState = {
  phase: BrickPhase
  requested: number
  loading: number
  ready: number
  failed: number
}

export type WorldSystemFields = {
  windField: Float32Array
  turbulenceField: Float32Array
  particleField: Float32Array
  intensity: number
}

export type WorldHudState = {
  mode: WorldSceneMode
  visualMode: WorldVisualMode
  quality: WorldQuality
  focus: WorldFocus | null
  activeStation: Station | null
  loadingLabel: string | null
  error: string | null
}

export type TerrainProvider = {
  previewPatch: (focus: WorldFocus, mode: Extract<WorldSceneMode, 'region' | 'ground'>, quality: WorldQuality) => TerrainSample
  loadPatch: (focus: WorldFocus, mode: Extract<WorldSceneMode, 'region' | 'ground'>, quality: WorldQuality, signal?: AbortSignal) => Promise<TerrainSample>
}

export type PlaceProvider = {
  search: (query: string, signal?: AbortSignal) => Promise<PlaceResult[]>
  reverse: (lat: number, lon: number, signal?: AbortSignal) => Promise<PlaceResult | null>
}

export type WeatherProvider = {
  readFocus: (focus: WorldFocus, signal?: AbortSignal) => Promise<WeatherSignals>
}

export type RadioProvider = {
  seed: (quality: WorldQuality, signal?: AbortSignal) => Promise<Station[]>
  nearby: (lat: number, lon: number, signal?: AbortSignal) => Promise<Station[]>
}

export type WorldProviders = {
  terrain: TerrainProvider
  places: PlaceProvider
  weather: WeatherProvider
  radio: RadioProvider
}

export const WORLD_QUALITY_LABELS: Record<WorldQuality, string> = {
  low: 'low',
  balanced: 'balanced',
  cinematic: 'cinematic',
}
