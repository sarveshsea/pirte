export const EARTH_RADIUS_METERS = 6_371_000
export const EARTH_RADIUS_UNITS = 6
export const METERS_PER_WORLD_UNIT = EARTH_RADIUS_METERS / EARTH_RADIUS_UNITS

export const CHUNK_SIZE_X = 32
export const CHUNK_SIZE_Y = 64
export const CHUNK_SIZE_Z = 32

export const TERRAIN_VERTICAL_EXAGGERATION = 28
export const TERRAIN_WORLD_SCALE = 1.28

export const ORBIT_DISTANCE = 12.2
export const REGION_DISTANCE = 0.72
export const GROUND_DISTANCE = 0.34

export const CITY_CELL_METERS = 24
export const CITY_GRID_WIDTH = 160
export const CITY_GRID_HEIGHT = 900
export const CITY_BRICK_CELLS = 12
export const CITY_PRESENTATION_HORIZONTAL_SCALE = 96
export const CITY_PRESENTATION_VERTICAL_SCALE = 168
export const CITY_SURFACE_LIFT = 0.032
export const CITY_REGION_DISTANCE = 1.18
export const CITY_GROUND_DISTANCE = 0.46
export const CITY_PREVIEW_DISTANCE = 2.2

export const MANHATTAN_BOUNDS = {
  west: -74.03,
  east: -73.90,
  south: 40.695,
  north: 40.885,
} as const

export const MANHATTAN_CENTER = {
  lat: 40.783,
  lon: -73.9712,
} as const
