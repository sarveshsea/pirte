import type { GameState } from './types'
import type { Kind } from './colors'

export const HUD_H = 7

// 3-wide × 5-tall digit font, painted with block glyphs. space = transparent.
const GLYPHS: Record<string, string[]> = {
  '0': ['███', '█ █', '█ █', '█ █', '███'],
  '1': ['  █', '  █', '  █', '  █', '  █'],
  '2': ['███', '  █', '███', '█  ', '███'],
  '3': ['███', '  █', ' ██', '  █', '███'],
  '4': ['█ █', '█ █', '███', '  █', '  █'],
  '5': ['███', '█  ', '███', '  █', '███'],
  '6': ['███', '█  ', '███', '█ █', '███'],
  '7': ['███', '  █', '  █', '  █', '  █'],
  '8': ['███', '█ █', '███', '█ █', '███'],
  '9': ['███', '█ █', '███', '  █', '███'],
  ' ': ['   ', '   ', '   ', '   ', '   '],
  '/': ['  █', ' █ ', ' █ ', '█  ', '█  '],
}

function faceFor(state: GameState): string {
  if (!state.player.alive) return '(x_x)'
  if (state.player.health < 30) return '(>_<)'
  if (state.player.health < 70) return '(o_o)'
  return '(^_^)'
}

function writeStr(
  out: string[][], ks: Kind[][],
  x: number, y: number, s: string,
  cols: number, rows: number, kind: Kind,
) {
  for (let i = 0; i < s.length; i++) {
    const ox = x + i
    if (ox >= 0 && ox < cols && y >= 0 && y < rows) {
      out[y][ox] = s[i]
      ks[y][ox] = kind
    }
  }
}

function writeNum(
  out: string[][], ks: Kind[][],
  x: number, y: number, n: number, width: number,
  cols: number, rows: number, kind: Kind,
) {
  const s = String(Math.max(0, Math.floor(n))).padStart(width, ' ')
  for (let d = 0; d < s.length; d++) {
    const g = GLYPHS[s[d]] ?? GLYPHS[' ']
    const ox = x + d * 4
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const ch = g[gy][gx]
        if (ch !== ' ') {
          const px = ox + gx
          const py = y + gy
          if (px >= 0 && px < cols && py >= 0 && py < rows) {
            out[py][px] = ch
            ks[py][px] = kind
          }
        }
      }
    }
  }
}

export function drawHud(
  out: string[][], ks: Kind[][],
  cols: number, rows: number, state: GameState,
) {
  const top = rows - HUD_H
  // separator
  for (let x = 0; x < cols; x++) { out[top][x] = '═'; ks[top][x] = 'hud_sep' }
  // clear rest of hud rows
  for (let y = top + 1; y < rows; y++) {
    for (let x = 0; x < cols; x++) { out[y][x] = ' '; ks[y][x] = 'blank' }
  }

  // face + tag
  writeStr(out, ks, 2, top + 2, faceFor(state), cols, rows, 'hud_face')
  writeStr(out, ks, 2, top + 3, 'e1m1',           cols, rows, 'hud_label')

  // three stat columns
  const hp  = state.player.health
  const low = hp < 30
  const statCols: { label: string; value: number; kind: Kind }[] = [
    { label: 'health', value: hp,                 kind: low ? 'pickup_health' : 'hud_health' },
    { label: 'armor',  value: state.player.armor, kind: 'hud_armor' },
    { label: 'ammo',   value: state.player.ammo,  kind: 'hud_ammo' },
  ]
  const digitW = 3 * 4
  const colW = digitW + 4
  const leftPad = 12
  const available = cols - leftPad - 18
  const gap = Math.max(2, Math.floor((available - colW * statCols.length) / (statCols.length + 1)))
  let x = leftPad + gap
  for (const s of statCols) {
    writeStr(out, ks, x, top + 1, s.label, cols, rows, 'hud_label')
    writeNum(out, ks, x, top + 2, s.value, 3, cols, rows, s.kind)
    x += colW + gap
  }

  // kills / items right-aligned
  const kills = `kills ${state.kills}/${state.totalKills}`
  const items = `items ${state.items}/${state.totalItems}`
  const rx = cols - Math.max(kills.length, items.length) - 2
  writeStr(out, ks, rx, top + 1, kills, cols, rows, 'hud_counter')
  writeStr(out, ks, rx, top + 3, items, cols, rows, 'hud_counter')
}
