import { type RGB, rgbToHsl, hslToRgb, rgbToOklch, oklchToOklab, oklabToRgb, mod360 } from './color'

export type HarmonyKind = 'complementary' | 'analogous' | 'triadic' | 'split' | 'tetradic' | 'monochrome'

export type Harmony = {
  kind: HarmonyKind
  label: string
  swatches: RGB[]
}

// classic hsl-based harmonies; returns the base color as the first swatch.
export function harmonies(base: RGB): Harmony[] {
  const hsl = rgbToHsl(base)
  const at = (h: number) => hslToRgb({ ...hsl, h: mod360(h) })
  return [
    { kind: 'complementary', label: 'complementary', swatches: [base, at(hsl.h + 180)] },
    { kind: 'analogous',     label: 'analogous',     swatches: [at(hsl.h - 30), base, at(hsl.h + 30)] },
    { kind: 'triadic',       label: 'triadic',       swatches: [base, at(hsl.h + 120), at(hsl.h + 240)] },
    { kind: 'split',         label: 'split complement', swatches: [base, at(hsl.h + 150), at(hsl.h + 210)] },
    { kind: 'tetradic',      label: 'tetradic',      swatches: [base, at(hsl.h + 90), at(hsl.h + 180), at(hsl.h + 270)] },
    { kind: 'monochrome',    label: 'tints + shades', swatches: monochrome(base) },
  ]
}

// five-step perceptually-uniform lightness ramp through oklab.
function monochrome(base: RGB): RGB[] {
  const lch = rgbToOklch(base)
  const steps = [0.18, 0.36, 0.54, 0.72, 0.88]
  return steps.map((l) => oklabToRgb(oklchToOklab({ l, c: Math.min(lch.c, 0.2), h: lch.h })))
}
