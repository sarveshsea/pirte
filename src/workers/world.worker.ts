import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  METERS_PER_WORLD_UNIT,
  TERRAIN_VERTICAL_EXAGGERATION,
  TERRAIN_WORLD_SCALE,
} from '../modules/world/constants'
import { sampleLand } from '../modules/radio/landmass'
import { clamp, mix, normalizeLon } from '../modules/world/geo'
import type {
  ChunkMesh,
  TerrainPatch,
  TerrainSample,
  VoxelChunk,
  WaterDisturbance,
  WaterMeshUpdate,
  WeatherSignals,
} from '../modules/world/types'

type BuildPatchMessage = {
  type: 'buildPatch'
  id: number
  sample: TerrainSample
  weather: WeatherSignals | null
}

type StepWaterMessage = {
  type: 'stepWater'
  id: number
  key: string
  weather: WeatherSignals | null
  disturbance?: WaterDisturbance
}

type DisposePatchMessage = {
  type: 'disposePatch'
  key: string
}

type WorkerMessage = BuildPatchMessage | StepWaterMessage | DisposePatchMessage

type PatchState = {
  key: string
  source: TerrainSample['source']
  bbox: TerrainSample['bbox']
  width: number
  height: number
  resolution: number
  heights: Float32Array
  waterMask: Uint8Array
  water: Float32Array
  slope: Float32Array
  surfaceVoxels: Uint8Array
  topMaterial: Uint8Array
  elevationMin: number
  elevationMax: number
  cellWorld: number
  voxelWorldY: number
  chunks: VoxelChunk[]
  baseMeshes: Array<Omit<ChunkMesh, 'waterPositions' | 'waterNormals' | 'waterIndices' | 'waterColors'>>
  tick: number
}

type FaceMask = {
  material: number
  sign: 1 | -1
} | null

const MATERIAL_ROCK = 1
const MATERIAL_DIRT = 2
const MATERIAL_GRASS = 3
const MATERIAL_SAND = 4
const MATERIAL_SNOW = 5

const patches = new Map<string, PatchState>()

function toIndexArray(indices: number[]) {
  let max = 0
  for (const index of indices) {
    if (index > max) max = index
  }
  if (max > 65535) throw new Error(`terrain index overflow: ${max}`)
  return new Uint16Array(indices)
}

function validateSample(sample: TerrainSample) {
  const size = sample.width * sample.height
  if (!Number.isFinite(sample.width) || !Number.isFinite(sample.height) || size <= 0) {
    throw new Error('invalid terrain sample dimensions')
  }
  if (sample.heightMeters.length !== size) {
    throw new Error(`terrain sample height mismatch: ${sample.heightMeters.length} !== ${size}`)
  }
  if (sample.waterMask.length !== size) {
    throw new Error(`terrain sample water mismatch: ${sample.waterMask.length} !== ${size}`)
  }
}

function weatherWave(weather: WeatherSignals | null) {
  return clamp((weather?.waveHeightM ?? 0) * 0.18 + 0.08, 0.04, 1.4)
}

function weatherFlood(weather: WeatherSignals | null) {
  return clamp((weather?.riverDischargeM3s ?? 0) / 4200, 0, 1.45)
}

function slopeAt(heights: Float32Array, width: number, height: number, col: number, row: number) {
  const left = heights[row * width + clamp(col - 1, 0, width - 1)]
  const right = heights[row * width + clamp(col + 1, 0, width - 1)]
  const up = heights[clamp(row - 1, 0, height - 1) * width + col]
  const down = heights[clamp(row + 1, 0, height - 1) * width + col]
  return Math.abs(right - left) + Math.abs(down - up)
}

function surfaceMaterial(height: number, slope: number, waterMask: number, min: number, max: number) {
  const normalized = clamp((height - min) / Math.max(1, max - min), 0, 1)
  if (waterMask || normalized < 0.18) return MATERIAL_SAND
  if (normalized > 0.78) return MATERIAL_SNOW
  if (slope > 180) return MATERIAL_ROCK
  return MATERIAL_GRASS
}

function subMaterial(top: number, depthFromTop: number) {
  if (depthFromTop === 0) return top
  if (depthFromTop < 3 && top !== MATERIAL_ROCK && top !== MATERIAL_SNOW) return MATERIAL_DIRT
  return MATERIAL_ROCK
}

function colorForMaterial(material: number, axis: number, sign: number) {
  let base: [number, number, number]
  switch (material) {
    case MATERIAL_GRASS:
      base = [0.24, 0.42, 0.30]
      break
    case MATERIAL_SAND:
      base = [0.54, 0.43, 0.28]
      break
    case MATERIAL_SNOW:
      base = [0.84, 0.90, 0.96]
      break
    case MATERIAL_DIRT:
      base = [0.42, 0.31, 0.24]
      break
    default:
      base = [0.26, 0.29, 0.34]
      break
  }
  const bias = axis === 1 ? 1.05 : sign > 0 ? 0.92 : 0.8
  return [base[0] * bias, base[1] * bias, base[2] * bias] as const
}

function emissiveColor(material: number) {
  if (material === MATERIAL_SNOW) return [0.74, 0.88, 1.0] as const
  if (material === MATERIAL_SAND) return [0.98, 0.71, 0.46] as const
  return [0.32, 0.82, 1.0] as const
}

function buildAscii(
  heights: Float32Array,
  water: Float32Array,
  waterMask: Uint8Array,
  width: number,
  height: number,
  elevationMin: number,
  elevationMax: number,
) {
  const chars = ' .,:-=+*#%@'
  const lines: string[] = []
  const range = Math.max(1, elevationMax - elevationMin)

  for (let row = 0; row < height; row++) {
    let line = ''
    for (let col = 0; col < width; col++) {
      const index = row * width + col
      if (water[index] > 0.35) { line += '≈'; continue }
      if (waterMask[index]) { line += '∿'; continue }
      const normalized = clamp((heights[index] - elevationMin) / range, 0, 0.999)
      line += chars[Math.floor(normalized * chars.length)]
    }
    lines.push(line)
  }

  return lines.join('\n')
}

function cornerToLocal(
  globalX: number,
  globalY: number,
  globalZ: number,
  width: number,
  depth: number,
  cellWorld: number,
  voxelWorldY: number,
): [number, number, number] {
  return [
    (globalX - width * 0.5) * cellWorld,
    globalY * voxelWorldY,
    (globalZ - depth * 0.5) * cellWorld,
  ]
}

function pushQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  corners: Array<[number, number, number]>,
  normal: [number, number, number],
  color: readonly [number, number, number],
) {
  const base = positions.length / 3
  for (const corner of corners) {
    positions.push(corner[0], corner[1], corner[2])
    normals.push(normal[0], normal[1], normal[2])
    colors.push(color[0], color[1], color[2])
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function sameFace(a: FaceMask, b: FaceMask) {
  return !!a && !!b && a.material === b.material && a.sign === b.sign
}

function buildTerrainMeshForChunk(
  state: PatchState,
  chunk: VoxelChunk,
): Omit<ChunkMesh, 'waterPositions' | 'waterNormals' | 'waterIndices' | 'waterColors'> {
  const [sizeX, sizeY, sizeZ] = chunk.size
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  const emissivePositions: number[] = []
  const emissiveNormals: number[] = []
  const emissiveIndices: number[] = []
  const emissiveColors: number[] = []

  const solidAt = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) return 0
    return chunk.occupancy[(y * sizeZ + z) * sizeX + x]
  }

  const materialAt = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) return 0
    return chunk.material[(y * sizeZ + z) * sizeX + x]
  }

  const dims = [sizeX, sizeY, sizeZ]
  const mask = new Array<FaceMask>(Math.max(sizeX * sizeY, sizeY * sizeZ, sizeX * sizeZ)).fill(null)
  const x = [0, 0, 0]
  const q = [0, 0, 0]

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3
    const v = (d + 2) % 3
    q[0] = 0
    q[1] = 0
    q[2] = 0
    q[d] = 1

    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = x[d] >= 0 ? solidAt(x[0], x[1], x[2]) : 0
          const b = x[d] < dims[d] - 1 ? solidAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0
          if (!!a === !!b) {
            mask[n++] = null
            continue
          }
          if (a) {
            mask[n++] = {
              material: materialAt(x[0], x[1], x[2]),
              sign: 1,
            }
          } else {
            mask[n++] = {
              material: materialAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]),
              sign: -1,
            }
          }
        }
      }

      x[d]++
      n = 0
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const face = mask[n]
          if (!face) {
            i++
            n++
            continue
          }

          let w = 1
          while (i + w < dims[u] && sameFace(mask[n + w], face)) w++

          let h = 1
          outer: for (; j + h < dims[v]; h++) {
            for (let k = 0; k < w; k++) {
              if (!sameFace(mask[n + k + h * dims[u]], face)) break outer
            }
          }

          x[u] = i
          x[v] = j
          const du = [0, 0, 0]
          const dv = [0, 0, 0]
          du[u] = w
          dv[v] = h

          const p0 = cornerToLocal(
            chunk.coord.x * CHUNK_SIZE_X + x[0],
            chunk.coord.y * CHUNK_SIZE_Y + x[1],
            chunk.coord.z * CHUNK_SIZE_Z + x[2],
            state.width,
            state.height,
            state.cellWorld,
            state.voxelWorldY,
          )
          const p1 = cornerToLocal(
            chunk.coord.x * CHUNK_SIZE_X + x[0] + du[0],
            chunk.coord.y * CHUNK_SIZE_Y + x[1] + du[1],
            chunk.coord.z * CHUNK_SIZE_Z + x[2] + du[2],
            state.width,
            state.height,
            state.cellWorld,
            state.voxelWorldY,
          )
          const p2 = cornerToLocal(
            chunk.coord.x * CHUNK_SIZE_X + x[0] + du[0] + dv[0],
            chunk.coord.y * CHUNK_SIZE_Y + x[1] + du[1] + dv[1],
            chunk.coord.z * CHUNK_SIZE_Z + x[2] + du[2] + dv[2],
            state.width,
            state.height,
            state.cellWorld,
            state.voxelWorldY,
          )
          const p3 = cornerToLocal(
            chunk.coord.x * CHUNK_SIZE_X + x[0] + dv[0],
            chunk.coord.y * CHUNK_SIZE_Y + x[1] + dv[1],
            chunk.coord.z * CHUNK_SIZE_Z + x[2] + dv[2],
            state.width,
            state.height,
            state.cellWorld,
            state.voxelWorldY,
          )

          const normal: [number, number, number] = [0, 0, 0]
          normal[d] = face.sign
          const color = colorForMaterial(face.material, d, face.sign)
          pushQuad(
            positions,
            normals,
            indices,
            colors,
            face.sign > 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1],
            normal,
            color,
          )

          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              mask[n + dx + dy * dims[u]] = null
            }
          }
          i += w
          n += w
        }
      }
    }
  }

  for (let localZ = 0; localZ < sizeZ; localZ++) {
    for (let localX = 0; localX < sizeX; localX++) {
      const globalX = chunk.coord.x * CHUNK_SIZE_X + localX
      const globalZ = chunk.coord.z * CHUNK_SIZE_Z + localZ
      if (globalX >= state.width || globalZ >= state.height) continue
      const index = globalZ * state.width + globalX
      const ridge = state.slope[index] > 150 || state.topMaterial[index] === MATERIAL_SNOW
      if (!ridge) continue
      const y = state.surfaceVoxels[index] + 1.012
      const x0 = cornerToLocal(globalX, y, globalZ, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const x1 = cornerToLocal(globalX + 1, y, globalZ, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const x2 = cornerToLocal(globalX + 1, y, globalZ + 1, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const x3 = cornerToLocal(globalX, y, globalZ + 1, state.width, state.height, state.cellWorld, state.voxelWorldY)
      pushQuad(
        emissivePositions,
        emissiveNormals,
        emissiveIndices,
        emissiveColors,
        [x0, x1, x2, x3],
        [0, 1, 0],
        emissiveColor(state.topMaterial[index]),
      )
    }
  }

  return {
    coord: chunk.coord,
    terrainPositions: new Float32Array(positions),
    terrainNormals: new Float32Array(normals),
    terrainIndices: toIndexArray(indices),
    terrainColors: new Float32Array(colors),
    emissivePositions: new Float32Array(emissivePositions),
    emissiveNormals: new Float32Array(emissiveNormals),
    emissiveIndices: toIndexArray(emissiveIndices),
    emissiveColors: new Float32Array(emissiveColors),
  }
}

function buildWaterMeshForChunk(state: PatchState, chunk: VoxelChunk) {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  const [sizeX, , sizeZ] = chunk.size

  for (let localZ = 0; localZ < sizeZ; localZ++) {
    for (let localX = 0; localX < sizeX; localX++) {
      const globalX = chunk.coord.x * CHUNK_SIZE_X + localX
      const globalZ = chunk.coord.z * CHUNK_SIZE_Z + localZ
      if (globalX >= state.width || globalZ >= state.height) continue
      const index = globalZ * state.width + globalX
      const depth = state.water[index]
      if (depth < 0.02) continue
      const y = state.surfaceVoxels[index] + 1 + depth
      const p0 = cornerToLocal(globalX, y, globalZ, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const p1 = cornerToLocal(globalX + 1, y, globalZ, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const p2 = cornerToLocal(globalX + 1, y, globalZ + 1, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const p3 = cornerToLocal(globalX, y, globalZ + 1, state.width, state.height, state.cellWorld, state.voxelWorldY)
      const color: [number, number, number] = [
        mix(0.14, 0.32, Math.min(1, depth * 0.35)),
        mix(0.34, 0.74, Math.min(1, depth * 0.55)),
        mix(0.54, 0.98, Math.min(1, depth * 0.7)),
      ]
      pushQuad(positions, normals, indices, colors, [p0, p1, p2, p3], [0, 1, 0], color)
    }
  }

  return {
    coord: chunk.coord,
    waterPositions: new Float32Array(positions),
    waterNormals: new Float32Array(normals),
    waterIndices: toIndexArray(indices),
    waterColors: new Float32Array(colors),
  }
}

function createChunks(state: Omit<PatchState, 'chunks' | 'baseMeshes' | 'tick'>) {
  const chunks: VoxelChunk[] = []
  for (let chunkZ = 0; chunkZ < Math.ceil(state.height / CHUNK_SIZE_Z); chunkZ++) {
    for (let chunkX = 0; chunkX < Math.ceil(state.width / CHUNK_SIZE_X); chunkX++) {
      const sizeX = Math.min(CHUNK_SIZE_X, state.width - chunkX * CHUNK_SIZE_X)
      const sizeZ = Math.min(CHUNK_SIZE_Z, state.height - chunkZ * CHUNK_SIZE_Z)
      const occupancy = new Uint8Array(sizeX * CHUNK_SIZE_Y * sizeZ)
      const material = new Uint8Array(sizeX * CHUNK_SIZE_Y * sizeZ)
      const water = new Float32Array(sizeX * sizeZ)

      for (let localZ = 0; localZ < sizeZ; localZ++) {
        const globalZ = chunkZ * CHUNK_SIZE_Z + localZ
        for (let localX = 0; localX < sizeX; localX++) {
          const globalX = chunkX * CHUNK_SIZE_X + localX
          const globalIndex = globalZ * state.width + globalX
          const top = state.surfaceVoxels[globalIndex]
          const topMat = state.topMaterial[globalIndex]
          water[localZ * sizeX + localX] = state.water[globalIndex]
          for (let y = 0; y <= top; y++) {
            const cellIndex = (y * sizeZ + localZ) * sizeX + localX
            occupancy[cellIndex] = 1
            material[cellIndex] = subMaterial(topMat, top - y)
          }
        }
      }

      chunks.push({
        coord: { x: chunkX, y: 0, z: chunkZ },
        size: [sizeX, CHUNK_SIZE_Y, sizeZ],
        occupancy,
        material,
        water,
        lod: 0,
      })
    }
  }
  return chunks
}

function createInitialWater(
  sample: TerrainSample,
  heights: Float32Array,
  slope: Float32Array,
  elevationMin: number,
  elevationMax: number,
  weather: WeatherSignals | null,
) {
  const water = new Float32Array(sample.width * sample.height)
  const relief = Math.max(180, elevationMax - elevationMin)
  const wave = weatherWave(weather)
  const flood = weatherFlood(weather)

  for (let row = 0; row < sample.height; row++) {
    const v = row / Math.max(1, sample.height - 1)
    const lat = mix(sample.bbox.north, sample.bbox.south, v)
    for (let col = 0; col < sample.width; col++) {
      const u = col / Math.max(1, sample.width - 1)
      const lon = normalizeLon(mix(sample.bbox.west, sample.bbox.east, u))
      const index = row * sample.width + col
      const land = sampleLand(lat, lon)
      const low = heights[index] < elevationMin + relief * 0.18
      const current = sample.waterMask[index]
        ? wave * (land ? 0.28 : 0.88)
        : low && slope[index] < 110
          ? flood * 0.22
          : 0
      water[index] = clamp(current, 0, 1.8)
    }
  }

  return water
}

function buildPatch(sample: TerrainSample, weather: WeatherSignals | null): TerrainPatch {
  validateSample(sample)

  let elevationMin = Infinity
  let elevationMax = -Infinity
  const slope = new Float32Array(sample.width * sample.height)

  for (let index = 0; index < sample.heightMeters.length; index++) {
    const height = sample.heightMeters[index]
    if (height < elevationMin) elevationMin = height
    if (height > elevationMax) elevationMax = height
  }

  for (let row = 0; row < sample.height; row++) {
    for (let col = 0; col < sample.width; col++) {
      slope[row * sample.width + col] = slopeAt(sample.heightMeters, sample.width, sample.height, col, row)
    }
  }

  const relief = Math.max(180, elevationMax - elevationMin)
  const baseFloorMeters = Math.min(0, elevationMin) - Math.max(40, relief * 0.06)
  const metersPerVoxel = Math.max(12, (elevationMax - baseFloorMeters) / (CHUNK_SIZE_Y - 6))
  const cellWorld = sample.resolution / METERS_PER_WORLD_UNIT * TERRAIN_WORLD_SCALE
  const voxelWorldY = metersPerVoxel / METERS_PER_WORLD_UNIT * TERRAIN_VERTICAL_EXAGGERATION
  const surfaceVoxels = new Uint8Array(sample.width * sample.height)
  const topMaterial = new Uint8Array(sample.width * sample.height)

  for (let index = 0; index < sample.heightMeters.length; index++) {
    const height = sample.heightMeters[index]
    surfaceVoxels[index] = clamp(Math.round((height - baseFloorMeters) / metersPerVoxel), 2, CHUNK_SIZE_Y - 4)
    topMaterial[index] = surfaceMaterial(height, slope[index], sample.waterMask[index], elevationMin, elevationMax)
  }

  const water = createInitialWater(sample, sample.heightMeters, slope, elevationMin, elevationMax, weather)

  const partialState = {
    key: sample.key,
    source: sample.source,
    bbox: sample.bbox,
    width: sample.width,
    height: sample.height,
    resolution: sample.resolution,
    heights: sample.heightMeters.slice(),
    waterMask: sample.waterMask.slice(),
    water,
    slope,
    surfaceVoxels,
    topMaterial,
    elevationMin,
    elevationMax,
    cellWorld,
    voxelWorldY,
  }

  const chunks = createChunks(partialState)
  const baseMeshes = chunks.map((chunk) => buildTerrainMeshForChunk(partialState as PatchState, chunk))
  const meshes = baseMeshes.map((mesh, index) => ({
    ...mesh,
    ...buildWaterMeshForChunk(partialState as PatchState, chunks[index]),
  }))

  const state: PatchState = {
    ...partialState,
    chunks,
    baseMeshes,
    tick: 0,
  }
  patches.set(sample.key, state)

  return {
    key: sample.key,
    source: sample.source,
    bbox: sample.bbox,
    gridSize: [sample.width, sample.height],
    chunkSize: [CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z],
    resolution: sample.resolution,
    elevationMin,
    elevationMax,
    waterMask: sample.waterMask.slice(),
    water: water.slice(),
    chunks,
    meshes,
    ascii: buildAscii(sample.heightMeters, water, sample.waterMask, sample.width, sample.height, elevationMin, elevationMax),
  }
}

function rebuildWater(state: PatchState): WaterMeshUpdate {
  const meshes = state.chunks.map((chunk) => buildWaterMeshForChunk(state, chunk))
  return {
    key: state.key,
    water: state.water.slice(),
    ascii: buildAscii(
      state.heights,
      state.water,
      state.waterMask,
      state.width,
      state.height,
      state.elevationMin,
      state.elevationMax,
    ),
    meshes,
  }
}

function stepWater(key: string, weather: WeatherSignals | null, disturbance?: WaterDisturbance) {
  const patch = patches.get(key)
  if (!patch) throw new Error(`missing patch ${key}`)

  const next = new Float32Array(patch.water.length)
  const wave = weatherWave(weather)
  const flood = weatherFlood(weather)
  patch.tick += 1

  for (let row = 0; row < patch.height; row++) {
    for (let col = 0; col < patch.width; col++) {
      const index = row * patch.width + col
      const current = patch.water[index]
      const here = patch.surfaceVoxels[index] + current
      let avg = 0
      let flow = 0
      let neighbors = 0

      const neighborsDelta = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]

      for (const [dx, dy] of neighborsDelta) {
        const nx = clamp(col + dx, 0, patch.width - 1)
        const ny = clamp(row + dy, 0, patch.height - 1)
        const ni = ny * patch.width + nx
        const neighborHeight = patch.surfaceVoxels[ni] + patch.water[ni]
        avg += patch.water[ni]
        flow += neighborHeight - here
        neighbors++
      }

      let value = current + ((avg / Math.max(1, neighbors)) - current) * 0.18
      value += flow * 0.026
      if (patch.waterMask[index]) {
        value = mix(value, wave * (0.82 + 0.22 * Math.sin(patch.tick * 0.18 + col * 0.15 + row * 0.07)), 0.14)
      } else if (patch.slope[index] < 90) {
        value += flood * 0.018
      }

      if (disturbance) {
        const dx = col / Math.max(1, patch.width - 1) - disturbance.x
        const dy = row / Math.max(1, patch.height - 1) - disturbance.y
        const radiusSq = Math.max(0.0001, disturbance.radius * disturbance.radius)
        value += disturbance.strength * Math.exp(-(dx * dx + dy * dy) / radiusSq)
      }

      value *= patch.waterMask[index] ? 0.992 : 0.978
      next[index] = clamp(value, 0, 2.8)
    }
  }

  patch.water = next
  return rebuildWater(patch)
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type === 'disposePatch') {
    patches.delete(message.key)
    return
  }

  if (message.type === 'buildPatch') {
    const patch = buildPatch(message.sample, message.weather)
    self.postMessage({
      type: 'patchBuilt',
      id: message.id,
      patch,
    })
    return
  }

  const next = stepWater(message.key, message.weather, message.disturbance)
  self.postMessage({
    type: 'waterStepped',
    id: message.id,
    update: next,
  })
}
