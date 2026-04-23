import type { CelestialState } from './types'
import { normalizeAngle, vec3, type Vec3Tuple } from './geo'

type BrightStar = {
  name: string
  raHours: number
  decDeg: number
  mag: number
  color: [number, number, number]
}

const BRIGHT_STARS: BrightStar[] = [
  { name: 'Sirius', raHours: 6.752, decDeg: -16.716, mag: -1.46, color: [0.93, 0.96, 1.0] },
  { name: 'Canopus', raHours: 6.399, decDeg: -52.695, mag: -0.74, color: [1.0, 0.95, 0.86] },
  { name: 'Arcturus', raHours: 14.261, decDeg: 19.182, mag: -0.05, color: [1.0, 0.79, 0.54] },
  { name: 'Vega', raHours: 18.615, decDeg: 38.783, mag: 0.03, color: [0.84, 0.89, 1.0] },
  { name: 'Capella', raHours: 5.279, decDeg: 45.997, mag: 0.08, color: [1.0, 0.88, 0.68] },
  { name: 'Rigel', raHours: 5.243, decDeg: -8.202, mag: 0.12, color: [0.78, 0.86, 1.0] },
  { name: 'Procyon', raHours: 7.655, decDeg: 5.225, mag: 0.34, color: [1.0, 0.94, 0.86] },
  { name: 'Betelgeuse', raHours: 5.919, decDeg: 7.407, mag: 0.42, color: [1.0, 0.63, 0.46] },
  { name: 'Achernar', raHours: 1.628, decDeg: -57.236, mag: 0.46, color: [0.80, 0.89, 1.0] },
  { name: 'Hadar', raHours: 14.063, decDeg: -60.374, mag: 0.61, color: [0.88, 0.91, 1.0] },
  { name: 'Altair', raHours: 19.846, decDeg: 8.868, mag: 0.77, color: [0.90, 0.92, 1.0] },
  { name: 'Aldebaran', raHours: 4.598, decDeg: 16.509, mag: 0.85, color: [1.0, 0.73, 0.52] },
  { name: 'Antares', raHours: 16.490, decDeg: -26.432, mag: 1.06, color: [1.0, 0.54, 0.44] },
  { name: 'Spica', raHours: 13.419, decDeg: -11.161, mag: 0.98, color: [0.82, 0.87, 1.0] },
  { name: 'Pollux', raHours: 7.755, decDeg: 28.026, mag: 1.14, color: [1.0, 0.82, 0.64] },
  { name: 'Fomalhaut', raHours: 22.961, decDeg: -29.622, mag: 1.16, color: [0.90, 0.94, 1.0] },
  { name: 'Deneb', raHours: 20.690, decDeg: 45.280, mag: 1.25, color: [0.86, 0.90, 1.0] },
  { name: 'Regulus', raHours: 10.139, decDeg: 11.967, mag: 1.35, color: [0.90, 0.92, 1.0] },
]

function julianDay(date: Date) {
  return date.getTime() / 86_400_000 + 2_440_587.5
}

function normalizeDegrees(value: number) {
  let next = value % 360
  if (next < 0) next += 360
  return next
}

function degToRad(value: number) {
  return (value * Math.PI) / 180
}

function radToDeg(value: number) {
  return (value * 180) / Math.PI
}

function equatorialToUnit(raRad: number, decRad: number): Vec3Tuple {
  const cosDec = Math.cos(decRad)
  return [
    cosDec * Math.sin(raRad),
    Math.sin(decRad),
    cosDec * Math.cos(raRad),
  ]
}

export function computeCelestialState(date: Date): CelestialState {
  const jd = julianDay(date)
  const jc = (jd - 2_451_545.0) / 36_525
  const geomMeanLon = normalizeDegrees(280.46646 + jc * (36_000.76983 + jc * 0.0003032))
  const geomMeanAnom = 357.52911 + jc * (35_999.05029 - 0.0001537 * jc)
  const ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
  const sunEq =
    Math.sin(degToRad(geomMeanAnom)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(degToRad(2 * geomMeanAnom)) * (0.019993 - 0.000101 * jc) +
    Math.sin(degToRad(3 * geomMeanAnom)) * 0.000289
  const trueLon = geomMeanLon + sunEq
  const omega = 125.04 - 1934.136 * jc
  const lambda = trueLon - 0.00569 - 0.00478 * Math.sin(degToRad(omega))
  const seconds = 21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))
  const obliq0 = 23 + (26 + seconds / 60) / 60
  const obliq = obliq0 + 0.00256 * Math.cos(degToRad(omega))
  const lambdaRad = degToRad(lambda)
  const obliqRad = degToRad(obliq)
  const raRad = Math.atan2(Math.cos(obliqRad) * Math.sin(lambdaRad), Math.cos(lambdaRad))
  const decRad = Math.asin(Math.sin(obliqRad) * Math.sin(lambdaRad))
  const gmstDeg = normalizeDegrees(
    280.46061837 +
    360.98564736629 * (jd - 2_451_545) +
    jc * jc * (0.000387933 - jc / 38_710_000),
  )
  const subsolarLonDeg = normalizeDegrees(radToDeg(raRad) - gmstDeg + 540) - 180
  const sunDir = equatorialToUnit(degToRad(subsolarLonDeg), decRad)
  const y = Math.tan(obliqRad / 2) ** 2
  const eqTime = 4 * radToDeg(
    y * Math.sin(2 * degToRad(geomMeanLon))
    - 2 * ecc * Math.sin(degToRad(geomMeanAnom))
    + 4 * ecc * y * Math.sin(degToRad(geomMeanAnom)) * Math.cos(2 * degToRad(geomMeanLon))
    - 0.5 * y * y * Math.sin(4 * degToRad(geomMeanLon))
    - 1.25 * ecc * ecc * Math.sin(2 * degToRad(geomMeanAnom)),
  )

  return {
    sunDir,
    siderealAngle: normalizeAngle(degToRad(gmstDeg)),
    exposure: Math.max(0.22, 1 - Math.abs(eqTime) / 18),
  }
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

function pushStar(
  positions: number[],
  colors: number[],
  sizes: number[],
  unit: Vec3Tuple,
  color: [number, number, number],
  size: number,
) {
  positions.push(unit[0], unit[1], unit[2])
  colors.push(color[0], color[1], color[2])
  sizes.push(size)
}

export function createStarField(count = 1400) {
  const positions: number[] = []
  const colors: number[] = []
  const sizes: number[] = []
  const random = seeded(0x9e3779b9)

  for (const star of BRIGHT_STARS) {
    const unit = equatorialToUnit(star.raHours / 24 * Math.PI * 2, degToRad(star.decDeg))
    const size = 4.4 - star.mag * 0.85
    pushStar(positions, colors, sizes, unit, star.color, size)
  }

  for (let index = 0; index < count; index++) {
    const u = random()
    const v = random()
    const lon = u * Math.PI * 2
    const z = v * 2 - 1
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const unit: Vec3Tuple = [Math.sin(lon) * r, z, Math.cos(lon) * r]
    const temperature = random()
    const mag = random()
    const size = 0.7 + (1 - mag ** 3) * 2.1
    const color: [number, number, number] = temperature > 0.76
      ? [1.0, 0.82 + temperature * 0.12, 0.62]
      : temperature < 0.18
        ? [0.76, 0.84, 1.0]
        : [0.9 + temperature * 0.1, 0.9 + temperature * 0.05, 1.0]
    pushStar(positions, colors, sizes, unit, color, size)
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    sizes: new Float32Array(sizes),
  }
}

export const MILKY_WAY_AXIS = vec3(0.18, 0.38, 0.91)
