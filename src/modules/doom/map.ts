// stylized e1m1 homage ~ 32 × 24 tiles. not a port, a sketch:
// hangar → zigzag corridor → door → nukage pit → exit switch.
//
// legend (characters in the raw source):
//   # wall     . floor   ~ nukage   D door (closed)   X exit switch
//   @ player spawn   I imp   h health pack   a ammo clip   b armor
// after parsing, spawn tiles become floor and the entity list is returned.

import type { Vec2 } from './types'

export type SpawnKind = 'player' | 'imp' | 'health' | 'ammo' | 'armor'
export type Spawn = { kind: SpawnKind; at: Vec2 }
export type ParsedMap = {
  grid: string[]
  width: number
  height: number
  spawns: Spawn[]
}

const RAW = [
  '################################',
  '#..............................#',
  '#.@............................#',
  '#........................I.....#',
  '#..............................#',
  '#......########................#',
  '#......#......#................#',
  '#......#......##########D#######',
  '#......#......#~~~~~~~~~~~~~~~.#',
  '#......#..a...#~~~~~~~~~~~~~~~.#',
  '#......#......#~~~~..b...~~~~~.#',
  '#......#......#~~~~......~~~~~.#',
  '#......###.####~~~~..I...~~~~~.#',
  '#..............~~~~~~~~~~~~~~~.#',
  '#..............~~~~~~~~~~~~~~~.#',
  '#...I..........................#',
  '#..............................#',
  '#######D########################',
  '#..............................#',
  '#...h.........I...........I....#',
  '#..............................#',
  '#..............................#',
  '#..........a........X..........#',
  '################################',
]

export function parseMap(): ParsedMap {
  const height = RAW.length
  const width = RAW[0].length
  const grid: string[] = []
  const spawns: Spawn[] = []
  for (let y = 0; y < height; y++) {
    let line = ''
    for (let x = 0; x < width; x++) {
      const ch = RAW[y][x]
      switch (ch) {
        case '@': spawns.push({ kind: 'player', at: { x: x + 0.5, y: y + 0.5 } }); line += '.'; break
        case 'I': spawns.push({ kind: 'imp',    at: { x: x + 0.5, y: y + 0.5 } }); line += '.'; break
        case 'h': spawns.push({ kind: 'health', at: { x: x + 0.5, y: y + 0.5 } }); line += '.'; break
        case 'a': spawns.push({ kind: 'ammo',   at: { x: x + 0.5, y: y + 0.5 } }); line += '.'; break
        case 'b': spawns.push({ kind: 'armor',  at: { x: x + 0.5, y: y + 0.5 } }); line += '.'; break
        default:  line += ch
      }
    }
    grid.push(line)
  }
  return { grid, width, height, spawns }
}

export function isBlocking(ch: string): boolean {
  return ch === '#' || ch === 'D'
}

export function isHazard(ch: string): boolean {
  return ch === '~'
}
