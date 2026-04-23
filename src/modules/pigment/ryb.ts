// RYB (red/yellow/blue painter's primaries) ↔ RGB.
//
// Based on Gossett & Chen, "Paint Inspired Color Compositing" (2004).
// Eight corners of the unit RYB cube are each assigned a target sRGB
// triple — trilinear interpolation then gives a smooth mapping that
// matches painterly expectations (R+Y=orange, R+B=violet, Y+B=green,
// R+Y+B=near-black) instead of additive-RGB surprises (Y+B=grey,
// R+B=magenta).

export type RGB = [number, number, number]

// Corner ordering: C[r][y][b] with each axis ∈ {0, 1}.
// Values are in linear 0..1; conversion to sRGB happens at emit time.
const C: RGB[][][] = [
  [
    // r = 0
    [[0.996, 0.980, 0.929], [0.086, 0.192, 0.447]], // white, blue
    [[0.988, 0.835, 0.212], [0.000, 0.455, 0.259]], // yellow, green
  ],
  [
    // r = 1
    [[0.827, 0.102, 0.184], [0.372, 0.102, 0.392]], // red, violet
    [[0.941, 0.447, 0.094], [0.102, 0.078, 0.063]], // orange, near-black
  ],
]

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v

// Trilinear interpolation over the RYB cube. Input r,y,b ∈ [0,1].
// Writes the linear-RGB result into `out` (reuse to avoid allocation).
export function rybToRgb(r: number, y: number, b: number, out: RGB = [0, 0, 0]): RGB {
  r = clamp01(r); y = clamp01(y); b = clamp01(b)
  const c000 = C[0][0][0], c001 = C[0][0][1]
  const c010 = C[0][1][0], c011 = C[0][1][1]
  const c100 = C[1][0][0], c101 = C[1][0][1]
  const c110 = C[1][1][0], c111 = C[1][1][1]
  for (let i = 0; i < 3; i++) {
    const i00 = c000[i] + (c001[i] - c000[i]) * b
    const i01 = c010[i] + (c011[i] - c010[i]) * b
    const i10 = c100[i] + (c101[i] - c100[i]) * b
    const i11 = c110[i] + (c111[i] - c110[i]) * b
    const i0  = i00    + (i01    - i00   ) * y
    const i1  = i10    + (i11    - i10   ) * y
    out[i]    = i0     + (i1     - i0    ) * r
  }
  return out
}

// Beer-Lambert absorption coefficients for a pigment: κ = -ln(rgb).
// Used to accumulate subtractive mass into a density buffer, which
// is then collapsed to pixel rgb via paper·exp(-κ·mass).
export function absorbance(rgb: RGB, out: RGB = [0, 0, 0]): RGB {
  // floor at a small positive to keep log finite
  out[0] = -Math.log(Math.max(rgb[0], 1e-3))
  out[1] = -Math.log(Math.max(rgb[1], 1e-3))
  out[2] = -Math.log(Math.max(rgb[2], 1e-3))
  return out
}

// Sinusoidally interpolate two points inside RYB, giving slightly
// nonlinear mid-tones — feels closer to drying paint than straight lerp.
export function mixRyb(a: RGB, b: RGB, t: number, out: RGB = [0, 0, 0]): RGB {
  const k = 0.5 - 0.5 * Math.cos(t * Math.PI)
  out[0] = a[0] + (b[0] - a[0]) * k
  out[1] = a[1] + (b[1] - a[1]) * k
  out[2] = a[2] + (b[2] - a[2]) * k
  return out
}

// Palettes specified as RYB endpoint pairs (top, bottom) per ribbon slot.
// tuned for emissive rendering on a near-black substrate — cooler hues
// glow best; pure-red endpoints flatten. each palette gives up to 8
// ribbon colorings so the user can flip between painterly moods.
export const PALETTES: Array<{ name: string; ribbons: Array<[RGB, RGB]> }> = [
  {
    // river — deep glacial blues through teals and aquamarines. default.
    name: 'river',
    ribbons: [
      [[0.08, 0.55, 0.80], [0.05, 0.75, 0.45]], // abyss → phyto
      [[0.02, 0.35, 0.90], [0.12, 0.65, 0.60]], // deep → turquoise
      [[0.00, 0.20, 0.70], [0.00, 0.85, 0.55]], // midnight → foam
      [[0.18, 0.45, 0.55], [0.00, 0.95, 0.30]], // slate → aurora
      [[0.05, 0.60, 0.85], [0.35, 0.50, 0.35]], // current → moss-green
      [[0.10, 0.70, 0.55], [0.10, 0.40, 0.75]], // teal → cyan
    ],
  },
  {
    name: 'classical',
    ribbons: [
      [[0.85, 0.10, 0.00], [0.70, 0.15, 0.30]], // vermilion → madder
      [[0.15, 0.00, 0.65], [0.05, 0.15, 0.30]], // ultramarine → prussian
      [[0.05, 0.85, 0.25], [0.35, 0.60, 0.10]], // lemon → olive
      [[0.55, 0.30, 0.00], [0.80, 0.55, 0.10]], // sienna → ochre
      [[0.60, 0.05, 0.55], [0.25, 0.05, 0.70]], // mauve → indigo
      [[0.10, 0.70, 0.55], [0.10, 0.40, 0.75]], // teal → cyan
    ],
  },
  {
    name: 'dawn',
    ribbons: [
      [[0.25, 0.45, 0.05], [0.60, 0.20, 0.00]], // peach → coral
      [[0.40, 0.00, 0.55], [0.15, 0.05, 0.70]], // lilac → deep blue
      [[0.05, 0.55, 0.10], [0.30, 0.40, 0.00]], // cream → khaki
      [[0.70, 0.20, 0.10], [0.50, 0.00, 0.45]], // rose → plum
      [[0.00, 0.25, 0.55], [0.10, 0.50, 0.35]], // haze → muted green
    ],
  },
  {
    name: 'ink',
    ribbons: [
      [[0.75, 0.15, 0.55], [0.15, 0.10, 0.75]], // aubergine → navy
      [[0.25, 0.10, 0.75], [0.05, 0.05, 0.85]], // indigo → midnight
      [[0.65, 0.05, 0.55], [0.40, 0.30, 0.70]], // violet → slate
      [[0.15, 0.25, 0.55], [0.55, 0.00, 0.55]], // periwinkle → magenta
    ],
  },
  {
    name: 'ember',
    ribbons: [
      [[0.90, 0.25, 0.00], [0.85, 0.05, 0.20]], // flame → cadmium
      [[0.75, 0.60, 0.05], [0.90, 0.30, 0.05]], // saffron → rust
      [[0.95, 0.80, 0.10], [0.60, 0.40, 0.00]], // yellow → bronze
      [[0.50, 0.10, 0.25], [0.80, 0.35, 0.10]], // wine → terracotta
    ],
  },
  {
    name: 'moss',
    ribbons: [
      [[0.10, 0.85, 0.35], [0.45, 0.70, 0.20]], // chartreuse → moss
      [[0.00, 0.50, 0.55], [0.15, 0.70, 0.40]], // seafoam → fern
      [[0.35, 0.40, 0.10], [0.20, 0.80, 0.25]], // olive → spring
      [[0.05, 0.35, 0.55], [0.10, 0.65, 0.50]], // mist → jade
    ],
  },
  {
    name: 'muted',
    ribbons: [
      [[0.55, 0.25, 0.20], [0.35, 0.15, 0.35]], // brick → dusk
      [[0.25, 0.10, 0.45], [0.10, 0.30, 0.45]], // amethyst → steel
      [[0.15, 0.45, 0.25], [0.30, 0.30, 0.20]], // sage → taupe
      [[0.35, 0.50, 0.10], [0.20, 0.15, 0.40]], // butter → shadow
    ],
  },
]
