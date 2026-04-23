import { stepClifford, stepDeJong, type CliffordParams, type DeJongParams } from '../attractors'
import { noise2 } from '../../lib/perlin'
import { clamp, mix } from './geo'
import type { WeatherSignals, WorldSystemFields } from './types'

export type SystemParticle = {
  x: number
  y: number
  z: number
  life: number
  speed: number
}

const WIND_ATTRACTOR: CliffordParams = { a: -1.42, b: 1.79, c: 1.03, d: -1.88 }
const TURBULENCE_ATTRACTOR: DeJongParams = { a: 1.63, b: -1.93, c: 1.22, d: -2.14 }

export function sampleWindVector(localX: number, localZ: number, time: number, weather: WeatherSignals | null) {
  const windSpeed = weather?.windSpeedKph ?? 18
  const weatherBias = clamp(windSpeed / 44, 0.15, 1.35)

  const chaos = { x: localX * 0.0024 + time * 0.04, y: localZ * 0.0024 - time * 0.02 }
  stepClifford(chaos, WIND_ATTRACTOR)

  const turbulence = { x: localX * 0.0018 - time * 0.03, y: localZ * 0.0018 + time * 0.02 }
  stepDeJong(turbulence, TURBULENCE_ATTRACTOR)

  const n0 = noise2(localX * 0.0012 + time * 0.06, localZ * 0.0012 - time * 0.04)
  const n1 = noise2(localX * 0.0026 - 17.3, localZ * 0.0026 + 8.1 + time * 0.03)
  const angle = chaos.x * 1.3 + n0 * 1.2 + turbulence.y * 0.4
  const magnitude = weatherBias * (0.55 + Math.abs(n1) * 0.45 + Math.abs(chaos.y) * 0.14)

  return {
    x: Math.cos(angle) * magnitude,
    z: Math.sin(angle) * magnitude,
    turbulence: clamp(Math.abs(turbulence.x * turbulence.y) + Math.abs(n0) * 0.4, 0, 1.6),
  }
}

export function buildWorldSystemFields(
  width: number,
  height: number,
  time: number,
  weather: WeatherSignals | null,
): WorldSystemFields {
  const windField = new Float32Array(width * height * 2)
  const turbulenceField = new Float32Array(width * height)
  const particleField = new Float32Array(width * height)
  let intensity = 0

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const localX = mix(-2200, 2200, col / Math.max(1, width - 1))
      const localZ = mix(-6000, 6000, row / Math.max(1, height - 1))
      const sample = sampleWindVector(localX, localZ, time, weather)
      const index = row * width + col
      windField[index * 2] = sample.x
      windField[index * 2 + 1] = sample.z
      turbulenceField[index] = sample.turbulence
      particleField[index] = clamp((Math.abs(sample.x) + Math.abs(sample.z)) * 0.35 + sample.turbulence * 0.2, 0, 1.2)
      intensity += particleField[index]
    }
  }

  return {
    windField,
    turbulenceField,
    particleField,
    intensity: intensity / Math.max(1, width * height),
  }
}

export function createSystemParticles(count: number): SystemParticle[] {
  const particles: SystemParticle[] = []
  for (let index = 0; index < count; index++) {
    particles.push({
      x: (Math.random() - 0.5) * 2800,
      z: (Math.random() - 0.5) * 9800,
      y: 0.08 + Math.random() * 0.26,
      life: Math.random() * 12,
      speed: 0.5 + Math.random() * 1.5,
    })
  }
  return particles
}

export function stepSystemParticles(
  particles: SystemParticle[],
  dt: number,
  time: number,
  weather: WeatherSignals | null,
) {
  for (const particle of particles) {
    const wind = sampleWindVector(particle.x, particle.z, time, weather)
    particle.x += wind.x * dt * 160 * particle.speed
    particle.z += wind.z * dt * 160 * particle.speed
    particle.y = 0.06 + clamp(wind.turbulence * 0.08 + 0.12, 0.04, 0.34)
    particle.life += dt

    if (particle.x < -3200) particle.x += 6400
    if (particle.x > 3200) particle.x -= 6400
    if (particle.z < -11000) particle.z += 22000
    if (particle.z > 11000) particle.z -= 22000
    if (particle.life > 18) {
      particle.life = 0
      particle.x = (Math.random() - 0.5) * 2800
      particle.z = (Math.random() - 0.5) * 9800
      particle.speed = 0.5 + Math.random() * 1.5
    }
  }
}
