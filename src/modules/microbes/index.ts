// microbes — real microbiology as ascii data-art.
// each sim implements `SimInstance`; static metadata lives in `SimSpec`.

import { createPhysarum } from './physarum'
import { createGrayScott } from './grayScott'
import { createChemotaxis } from './chemotaxis'
import { createExcitable } from './excitable'

export type MetricValue = number

export type SimInstance = {
  reset(cols: number, rows: number): void
  reseed(): void
  step(dt: number): void
  render(): string
  metrics(): Record<string, MetricValue>
  params(): Record<string, string>
  setSubPreset?(n: number): void
  subPresetIdx?: () => number
}

export type SimSpec = {
  id: 'physarum' | 'turing' | 'chemotaxis' | 'excitable'
  label: string
  phenomenon: string
  citation: string
  equation: string
  subPresets?: readonly string[]
  create(): SimInstance
}

export const RAMP = ' .·:+=*xX%#@█'

// clamp a float [0,1] to a ramp index
export function rampChar(v: number): string {
  const last = RAMP.length - 1
  if (v <= 0) return RAMP[0]
  if (v >= 1) return RAMP[last]
  return RAMP[Math.round(v * last)]
}

export const SIMS: SimSpec[] = [
  {
    id: 'physarum',
    label: 'physarum',
    phenomenon: 'physarum polycephalum · foraging network',
    citation: 'jones · artificial life 19(4) · 2010',
    equation: 'agent: sense(±45°, r=9) → turn → step → deposit; grid: diffuse + decay',
    create: createPhysarum,
  },
  {
    id: 'turing',
    label: 'turing',
    phenomenon: 'gray-scott reaction-diffusion · morphogenesis',
    citation: 'turing 1952 · pearson · science 261 · 1993',
    equation: 'du/dt = Du∇²u − uv² + F(1−u)\ndv/dt = Dv∇²v + uv² − (F+k)v',
    subPresets: ['spots', 'stripes', 'solitons', 'coral'] as const,
    create: createGrayScott,
  },
  {
    id: 'chemotaxis',
    label: 'chemotaxis',
    phenomenon: 'e. coli · biased run-and-tumble',
    citation: 'berg & brown · nature 239 · 1972',
    equation: 'dc > dc_prev ⇒ extend run · else tumble (θ ~ U[0,2π))',
    create: createChemotaxis,
  },
  {
    id: 'excitable',
    label: 'excitable',
    phenomenon: 'fitzhugh-nagumo · cardiac / neural spiral waves',
    citation: 'fitzhugh 1961 · nagumo et al 1962',
    equation: 'du/dt = Du∇²u + u − u³ − v\ndv/dt = ε(u − αv − β)',
    create: createExcitable,
  },
]
