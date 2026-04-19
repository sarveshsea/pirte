export type AttractorKind = 'lorenz' | 'clifford' | 'dejong'

export type LorenzParams = { sigma: number; rho: number; beta: number }
export type CliffordParams = { a: number; b: number; c: number; d: number }
export type DeJongParams = CliffordParams

export const DEFAULTS = {
  lorenz: { sigma: 10, rho: 28, beta: 8 / 3 } as LorenzParams,
  clifford: { a: -1.7, b: 1.3, c: -0.1, d: -1.21 } as CliffordParams,
  dejong: { a: 1.641, b: 1.902, c: 0.316, d: 1.525 } as DeJongParams,
}

// Lorenz returns a pair of 2D projections per integration step
export function stepLorenz(state: { x: number; y: number; z: number }, p: LorenzParams, dt: number) {
  const dx = p.sigma * (state.y - state.x)
  const dy = state.x * (p.rho - state.z) - state.y
  const dz = state.x * state.y - p.beta * state.z
  state.x += dx * dt
  state.y += dy * dt
  state.z += dz * dt
}

export function stepClifford(state: { x: number; y: number }, p: CliffordParams) {
  const nx = Math.sin(p.a * state.y) + p.c * Math.cos(p.a * state.x)
  const ny = Math.sin(p.b * state.x) + p.d * Math.cos(p.b * state.y)
  state.x = nx
  state.y = ny
}

export function stepDeJong(state: { x: number; y: number }, p: DeJongParams) {
  const nx = Math.sin(p.a * state.y) - Math.cos(p.b * state.x)
  const ny = Math.sin(p.c * state.x) - Math.cos(p.d * state.y)
  state.x = nx
  state.y = ny
}

export function randomClifford(): CliffordParams {
  const r = () => -2 + Math.random() * 4
  return { a: r(), b: r(), c: r(), d: r() }
}
export function randomDeJong(): DeJongParams {
  const r = () => -2.5 + Math.random() * 5
  return { a: r(), b: r(), c: r(), d: r() }
}
