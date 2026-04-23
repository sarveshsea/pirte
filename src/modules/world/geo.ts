import type { WorldFocus } from './types'
import { EARTH_RADIUS_UNITS } from './constants'

export type Vec3Tuple = [number, number, number]

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function normalizeAngle(angle: number) {
  let next = angle
  while (next < -Math.PI) next += Math.PI * 2
  while (next > Math.PI) next -= Math.PI * 2
  return next
}

export function normalizeLon(lon: number) {
  let next = lon
  while (next < -180) next += 360
  while (next > 180) next -= 360
  return next
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function vec3(x = 0, y = 0, z = 0): Vec3Tuple {
  return [x, y, z]
}

export function addVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function subVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scaleVec3(a: Vec3Tuple, scalar: number): Vec3Tuple {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar]
}

export function dotVec3(a: Vec3Tuple, b: Vec3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function crossVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function lengthVec3(a: Vec3Tuple) {
  return Math.hypot(a[0], a[1], a[2])
}

export function normalizeVec3(a: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

export function lerpVec3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t),
  ]
}

export function latLonToUnit(lat: number, lon: number): Vec3Tuple {
  const latR = (lat * Math.PI) / 180
  const lonR = (lon * Math.PI) / 180
  const cosLat = Math.cos(latR)
  return [
    cosLat * Math.sin(lonR),
    Math.sin(latR),
    cosLat * Math.cos(lonR),
  ]
}

export function latLonToWorld(lat: number, lon: number, radius = EARTH_RADIUS_UNITS): Vec3Tuple {
  const unit = latLonToUnit(lat, lon)
  return [unit[0] * radius, unit[1] * radius, unit[2] * radius]
}

export function cartesianToLatLon(point: Vec3Tuple) {
  const unit = normalizeVec3(point)
  return {
    lat: Math.asin(clamp(unit[1], -1, 1)) * 180 / Math.PI,
    lon: Math.atan2(unit[0], unit[2]) * 180 / Math.PI,
  }
}

export function focusBasis(focus: Pick<WorldFocus, 'lat' | 'lon'>, radius = EARTH_RADIUS_UNITS) {
  const up = normalizeVec3(latLonToWorld(focus.lat, focus.lon, 1))
  const lonR = (focus.lon * Math.PI) / 180
  const latR = (focus.lat * Math.PI) / 180
  const east = normalizeVec3([Math.cos(lonR), 0, -Math.sin(lonR)])
  const north = normalizeVec3([
    -Math.sin(latR) * Math.sin(lonR),
    Math.cos(latR),
    -Math.sin(latR) * Math.cos(lonR),
  ])

  return {
    center: scaleVec3(up, radius),
    east,
    north,
    up,
  }
}

export function worldFromLocal(
  basis: ReturnType<typeof focusBasis>,
  local: Vec3Tuple,
): Vec3Tuple {
  return addVec3(
    addVec3(
      addVec3(basis.center, scaleVec3(basis.east, local[0])),
      scaleVec3(basis.up, local[1]),
    ),
    scaleVec3(basis.north, local[2]),
  )
}

export function directionFromLocal(
  basis: ReturnType<typeof focusBasis>,
  direction: Vec3Tuple,
): Vec3Tuple {
  return normalizeVec3(
    addVec3(
      addVec3(scaleVec3(basis.east, direction[0]), scaleVec3(basis.up, direction[1])),
      scaleVec3(basis.north, direction[2]),
    ),
  )
}
