// microbes — real microbiology + chemistry as ascii data-art.
// each sim implements `SimInstance`; static metadata lives in `SimSpec`.
//
// the interface supports two render modes:
//   • single-layer `render()` — one text grid, colored by the route default
//   • multi-layer `renderLayers()` — N texts at the same grid, each with its
//     own css color / opacity. used when multiple species or reagents share
//     the dish and need distinct palettes.
//
// a `phase()` sample + `phaseSpec()` bounds let the route draw a live phase
// portrait (predator-vs-prey orbit, SIR curve, reagent coupling, etc).

import { createPhysarum } from './physarum'
import { createGrayScott } from './grayScott'
import { createChemotaxis } from './chemotaxis'
import { createExcitable } from './excitable'
import { createLotkaVolterra } from './lotkaVolterra'
import { createSIR } from './sir'
import { createBelousovZhabotinsky } from './belousovZhabotinsky'
import { createToggleSwitch } from './toggleSwitch'

export type MetricValue = number

export type SimLayer = {
  text: string           // rows joined with '\n'; space means "empty cell here"
  color: string          // css color — hex, rgb, or var()
  opacity?: number
}

export type PhaseSample = { x: number; y: number }

export type PhaseSpec = {
  xLabel: string
  yLabel: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export type SimInstance = {
  reset(cols: number, rows: number): void
  reseed(): void
  step(dt: number): void
  render(): string
  renderLayers?(): SimLayer[]
  metrics(): Record<string, MetricValue>
  params(): Record<string, string>
  phase?(): PhaseSample | null
  phaseSpec?(): PhaseSpec
  setSubPreset?(n: number): void
  subPresetIdx?: () => number
}

export type SimSpec = {
  id:
    | 'physarum' | 'turing' | 'chemotaxis' | 'excitable'
    | 'lotka' | 'sir' | 'belousov' | 'toggle'
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

// themed species palette — each id keyed to a css color so renderLayers()
// callers can pick from a consistent vocabulary.
export const SPECIES_COLOR = {
  neutral: 'var(--color-fg)',
  prey:    '#6ad1ff',  // cyan — herbivore / substrate / susceptible
  predator:'#ff6b8a',  // rosy pink — carnivore / infected / activator
  recovered:'#c28bff', // violet — resistant / catalyst / recovered
  geneA:   '#7fffa8',  // lime — toggle gene A
  geneB:   '#ffae4f',  // amber — toggle gene B
  mixed:   'var(--color-dim)',
} as const

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
  {
    id: 'lotka',
    label: 'lotka-volterra',
    phenomenon: 'predator · prey coupled populations',
    citation: 'lotka 1925 · volterra 1926',
    equation: 'dH/dt = Dh∇²H + aH − bHP\ndP/dt = Dp∇²P + cHP − dP',
    create: createLotkaVolterra,
  },
  {
    id: 'sir',
    label: 'sir epidemic',
    phenomenon: 'kermack-mckendrick · spatial contagion',
    citation: 'kermack & mckendrick · proc. royal soc. 1927',
    equation: 'dS/dt = −β S ⟨I⟩ₙ\ndI/dt = +β S ⟨I⟩ₙ − γ I\ndR/dt = +γ I',
    create: createSIR,
  },
  {
    id: 'belousov',
    label: 'belousov-zhabotinsky',
    phenomenon: 'oregonator · autocatalytic spiral chemistry',
    citation: 'fields & noyes · j. chem. phys. 1974',
    equation: 'du/dt = ε⁻¹(u(1−u) − fv(u−q)/(u+q)) + Du∇²u\ndv/dt = u − v + Dv∇²v',
    create: createBelousovZhabotinsky,
  },
  {
    id: 'toggle',
    label: 'toggle switch',
    phenomenon: 'gardner-cantor-collins · bistable gene network',
    citation: 'gardner · cantor · collins · nature 403 · 2000',
    equation: 'dA/dt = α₁/(1+Bⁿ) − A + ξ\ndB/dt = α₂/(1+Aⁿ) − B + ξ',
    create: createToggleSwitch,
  },
]
