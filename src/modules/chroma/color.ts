// color math for /chroma. pure functions; no deps.
// rgb components are 0..255, hsl/hsv h∈[0,360), s/l/v∈[0,1], alpha omitted.

export type RGB = { r: number; g: number; b: number }
export type HSL = { h: number; s: number; l: number }
export type HSV = { h: number; s: number; v: number }
export type OKLCh = { l: number; c: number; h: number }  // lightness, chroma, hue
export type LAB  = { l: number; a: number; b: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const clamp255 = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
const mod360 = (h: number) => ((h % 360) + 360) % 360

// ───────── hex ─────────

export function parseHex(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, '')
  if (s.length === 3 && /^[0-9a-f]{3}$/i.test(s)) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    }
  }
  if (s.length === 6 && /^[0-9a-f]{6}$/i.test(s)) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    }
  }
  return null
}

export function rgbToHex(rgb: RGB): string {
  const toHex = (v: number) => clamp255(v).toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export function rgbToCss(rgb: RGB): string {
  return `rgb(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)})`
}

// ───────── hsl / hsv ─────────

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
      case gn: h = ((bn - rn) / d + 2); break
      case bn: h = ((rn - gn) / d + 4); break
    }
    h *= 60
  }
  return { h: mod360(h), s, l }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const hk = mod360(h) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const tc = (t: number) => {
    t = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: tc(hk + 1 / 3) * 255, g: tc(hk) * 255, b: tc(hk - 1 / 3) * 255 }
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
      case gn: h = ((bn - rn) / d + 2); break
      case bn: h = ((rn - gn) / d + 4); break
    }
    h *= 60
  }
  return { h: mod360(h), s, v }
}

// ───────── oklab / oklch (approx; srgb → oklab via the björn ottosson formulation) ─────────
// https://bottosson.github.io/posts/oklab/

function srgbToLinear(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return v * 255
}

export function rgbToOklab({ r, g, b }: RGB): LAB {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

export function oklabToOklch({ l, a, b }: LAB): OKLCh {
  const c = Math.hypot(a, b)
  const h = mod360(Math.atan2(b, a) * 180 / Math.PI)
  return { l, c, h }
}

export function oklchToOklab({ l, c, h }: OKLCh): LAB {
  const hr = (h * Math.PI) / 180
  return { l, a: c * Math.cos(hr), b: c * Math.sin(hr) }
}

export function oklabToRgb({ l, a, b }: LAB): RGB {
  const lp = l + 0.3963377774 * a + 0.2158037573 * b
  const mp = l - 0.1055613458 * a - 0.0638541728 * b
  const sp = l - 0.0894841775 * a - 1.2914855480 * b
  const lr = lp ** 3, lg = mp ** 3, lb = sp ** 3
  const r =  4.0767416621 * lr - 3.3077115913 * lg + 0.2309699292 * lb
  const g = -1.2684380046 * lr + 2.6097574011 * lg - 0.3413193965 * lb
  const bb = -0.0041960863 * lr - 0.7034186147 * lg + 1.7076147010 * lb
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(bb) }
}

export function rgbToOklch(rgb: RGB): OKLCh { return oklabToOklch(rgbToOklab(rgb)) }

// ───────── luminance + contrast (wcag) ─────────

export function relativeLuminance({ r, g, b }: RGB): number {
  const L = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b)
}

export function contrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export function wcagGrade(ratio: number): 'aaa' | 'aa' | 'aa-large' | 'fail' {
  if (ratio >= 7)   return 'aaa'
  if (ratio >= 4.5) return 'aa'
  if (ratio >= 3)   return 'aa-large'
  return 'fail'
}

// export helpers
export const WHITE: RGB = { r: 255, g: 255, b: 255 }
export const BLACK: RGB = { r: 0, g: 0, b: 0 }

export { clamp01, clamp255, mod360 }
