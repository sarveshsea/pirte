export type Palette = string[]

// six saturated palettes. each has 6 colors — enough variation per shard without
// feeling like a rainbow soup. names are lowercase per pirte convention.
export const PALETTES: Palette[] = [
  // sunset
  ['#ff5a3a', '#ff9248', '#ffc94a', '#f85c7a', '#c82bc6', '#6a1c90'],
  // aurora
  ['#4aff9a', '#38d0ff', '#a28bff', '#ffd88a', '#ff6ec9', '#2fa5e8'],
  // deep sea
  ['#0a5e8c', '#1a9ab8', '#47e2d3', '#8cf0c8', '#ffe48a', '#c64288'],
  // magma
  ['#2a0a2a', '#8e1040', '#e23a3a', '#ff8a28', '#ffd24a', '#fff0a8'],
  // neon
  ['#ff00d4', '#00e5ff', '#c0ff28', '#ff2d60', '#5a00ff', '#ffd400'],
  // forest
  ['#1e5e3a', '#4ba860', '#a8d850', '#f0c848', '#e06a3e', '#6a3aa8'],
]

export const PALETTE_NAMES: string[] = [
  'sunset',
  'aurora',
  'deep sea',
  'magma',
  'neon',
  'forest',
]
