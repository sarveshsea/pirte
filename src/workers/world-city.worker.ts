import {
  CITY_BRICK_CELLS,
  CITY_CELL_METERS,
  CITY_GRID_HEIGHT,
  CITY_GRID_WIDTH,
  METERS_PER_WORLD_UNIT,
} from '../modules/world/constants'
import { sampleManhattanCell } from '../modules/world/manhattan'
import type { BrickPhase, VoxelBrick, VoxelBrickId } from '../modules/world/types'

type BuildBrickMessage = {
  type: 'buildBrick'
  id: number
  brick: VoxelBrickId
  phase: BrickPhase
}

type WorkerMessage = BuildBrickMessage

type WorkerResponse = {
  type: 'brickBuilt'
  id: number
  brick: VoxelBrick
}

function lodStride(lod: number) {
  return lod === 0 ? 1 : lod === 1 ? 4 : 8
}

function localXFromCell(cellX: number, stride: number) {
  return ((cellX + stride * 0.5 - CITY_GRID_WIDTH * 0.5) * CITY_CELL_METERS) / METERS_PER_WORLD_UNIT
}

function localZFromCell(cellZ: number, stride: number) {
  return ((cellZ + stride * 0.5 - CITY_GRID_HEIGHT * 0.5) * CITY_CELL_METERS) / METERS_PER_WORLD_UNIT
}

function localYFromVoxel(voxelY: number) {
  return (voxelY * CITY_CELL_METERS) / METERS_PER_WORLD_UNIT
}

function pushVoxel(
  offsets: number[],
  colors: number[],
  alpha: number[],
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
  strength: number,
) {
  offsets.push(x, y, z)
  colors.push(color[0], color[1], color[2])
  alpha.push(strength)
}

function structureColor(height: number, lod: number) {
  const glow = Math.min(1, height / 26)
  return lod === 0
    ? [0.46 + glow * 0.18, 0.72 + glow * 0.12, 1.0] as const
    : [0.36 + glow * 0.16, 0.61 + glow * 0.10, 0.92] as const
}

function terrainColor() {
  return [0.22, 0.34, 0.30] as const
}

function parkColor() {
  return [0.18, 0.42, 0.24] as const
}

function roadColor() {
  return [0.15, 0.19, 0.27] as const
}

function waterColor() {
  return [0.22, 0.62, 0.94] as const
}

function buildBrick(brick: VoxelBrickId, phase: BrickPhase): VoxelBrick {
  const stride = lodStride(brick.lod)
  const startX = brick.x * CITY_BRICK_CELLS * stride
  const startZ = brick.z * CITY_BRICK_CELLS * stride

  const voxels: number[] = []
  const materials: number[] = []
  const lighting: number[] = []
  const water: number[] = []
  const waterColors: number[] = []
  const waterLighting: number[] = []

  let terrainCount = 0
  let structureCount = 0
  let roadCount = 0
  let parkCount = 0
  let waterCount = 0
  let maxVoxelY = 1
  let sourceMask = 0

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const

  for (let localZ = 0; localZ < CITY_BRICK_CELLS; localZ++) {
    const cellZ = startZ + localZ * stride
    for (let localX = 0; localX < CITY_BRICK_CELLS; localX++) {
      const cellX = startX + localX * stride
      const cell = sampleManhattanCell(cellX, cellZ)

      if (cell.water) {
        const wx = localXFromCell(cellX, stride)
        const wz = localZFromCell(cellZ, stride)
        water.push(wx, localYFromVoxel(0.8), wz)
        waterColors.push(...waterColor())
        waterLighting.push(phase === 'detail' ? 0.38 : 0.3)
        waterCount += 1
        sourceMask |= 16
        continue
      }

      const x = localXFromCell(cellX, stride)
      const z = localZFromCell(cellZ, stride)

      if (cell.terrainHeight > 0) {
        const terrainTop = localYFromVoxel(cell.terrainHeight - 0.5)
        if (cell.park) {
          pushVoxel(voxels, materials, lighting, x, terrainTop, z, parkColor(), phase === 'detail' ? 0.22 : 0.18)
          parkCount += 1
          sourceMask |= 8
        } else if (cell.road) {
          pushVoxel(voxels, materials, lighting, x, terrainTop, z, roadColor(), phase === 'detail' ? 0.18 : 0.14)
          roadCount += 1
          sourceMask |= 4
        } else {
          pushVoxel(voxels, materials, lighting, x, terrainTop, z, terrainColor(), phase === 'detail' ? 0.24 : 0.18)
          terrainCount += 1
          sourceMask |= 1
        }
        maxVoxelY = Math.max(maxVoxelY, cell.terrainHeight)
      }

      if (cell.structureHeight <= 0) continue

      const boundary = neighbors.some(([dx, dz]) => {
        const neighbor = sampleManhattanCell(cellX + dx * stride, cellZ + dz * stride)
        return !neighbor.land || neighbor.road || neighbor.park || neighbor.structureHeight <= 0
      })

      const baseY = cell.terrainHeight
      const topY = baseY + cell.structureHeight
      const color = structureColor(cell.structureHeight, brick.lod)
      const shellStep = brick.lod === 0 ? 1 : brick.lod === 1 ? 2 : 3

      for (let voxelY = baseY; voxelY < topY; voxelY += shellStep) {
        const onTop = voxelY >= topY - shellStep
        if (!boundary && !onTop) continue
        const glow = phase === 'detail'
          ? 0.22 + (onTop ? 0.28 : 0.12)
          : phase === 'neighborhood'
            ? 0.18 + (onTop ? 0.18 : 0.08)
            : 0.14 + (onTop ? 0.12 : 0.05)
        pushVoxel(voxels, materials, lighting, x, localYFromVoxel(voxelY + 0.5), z, color, glow)
        structureCount += 1
      }
      sourceMask |= 2
      maxVoxelY = Math.max(maxVoxelY, topY)
    }
  }

  const span = CITY_BRICK_CELLS * stride
  return {
    id: brick,
    phase,
    bounds: {
      min: [localXFromCell(startX, 0) - (CITY_CELL_METERS / METERS_PER_WORLD_UNIT) * 0.5, 0, localZFromCell(startZ, 0) - (CITY_CELL_METERS / METERS_PER_WORLD_UNIT) * 0.5],
      max: [
        localXFromCell(startX + span, 0) + (CITY_CELL_METERS / METERS_PER_WORLD_UNIT) * 0.5,
        localYFromVoxel(maxVoxelY + 1),
        localZFromCell(startZ + span, 0) + (CITY_CELL_METERS / METERS_PER_WORLD_UNIT) * 0.5,
      ],
    },
    voxelScale: (CITY_CELL_METERS * stride) / METERS_PER_WORLD_UNIT * 0.92,
    voxels: new Float32Array(voxels),
    materials: new Float32Array(materials),
    lighting: new Float32Array(lighting),
    water: new Float32Array(water),
    waterLighting: new Float32Array(waterLighting),
    waterColors: new Float32Array(waterColors),
    sourceMask,
    kindCounts: {
      terrain: terrainCount,
      structures: structureCount,
      roads: roadCount,
      parks: parkCount,
      water: waterCount,
    },
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  const brick = buildBrick(message.brick, message.phase)
  const payload: WorkerResponse = {
    type: 'brickBuilt',
    id: message.id,
    brick,
  }
  self.postMessage(payload)
}
