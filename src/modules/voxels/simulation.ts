// 3D cellular automata simulator — optimized hot path.
//
// grid is a flat Uint8Array of N³ cells. cell value:
//   0           = dead
//   states - 1  = freshly born / living
//   1..states-2 = decaying (cannot give birth, occupies space)
//
// the step() function avoids the naive 26-neighbor read per cell for Moore
// rules. instead it runs a 3-pass **separable 3D convolution** on a binary
// "was-full-last-step" mask, cutting step cost from O(26 · N³) to O(3 · N³).
//
// how it works:
//   prev[i] = (cells[i] === full) ? 1 : 0
//   sx[x,y,z]  = prev[x-1,y,z] + prev[x,y,z] + prev[x+1,y,z]      (X pass)
//   sy[x,y,z]  = sx[x,y-1,z]   + sx[x,y,z]   + sx[x,y+1,z]        (Y pass)
//   count[i]   = sy[x,y,z-1]   + sy[x,y,z]   + sy[x,y,z+1] - prev[i]  (Z pass)
// the final subtraction drops the center cell so `count` is neighbors only.
// wrap is toroidal — no-edge artifacts, preserves total volume.
//
// for von neumann rules we keep the direct 6-neighbor read (already O(6 · N³)
// and not separable without extra passes).
//
// survival / birth sets are packed into 32-bit bitmasks so membership tests
// are `(bits >>> count) & 1` — one shift + one and, no array deref.
//
// the step ALSO populates an `aliveIndices` list so the renderer can iterate
// only live cells instead of the full grid. with 5-10% grid occupancy this
// cuts the per-frame inner-loop cost by ~10-20×.

import type { Rule } from './rules'

export type Grid = {
  n: number
  cells: Uint8Array
  // per-cell: how many alive neighbors it had at the moment it was born.
  // drives the density-based color classification (sparse/medium/dense).
  birthDensity: Uint8Array
  // per-cell: generation at which it was born (mod 255)
  birthGen: Uint8Array
  // dense list of cell linear-indices where cells[i] > 0. maintained each step.
  aliveIndices: Uint32Array
  aliveCount: number
  // scratch buffers for the separable moore convolution.
  // allocated lazily so small grids pay for what they use.
  _prev: Uint8Array
  _sx: Uint8Array
  _sy: Uint8Array
}

const MAX_ALIVE = 1 << 17 // 131k — enough for a full 32³ grid

export function createGrid(n: number): Grid {
  const sz = n * n * n
  return {
    n,
    cells: new Uint8Array(sz),
    birthDensity: new Uint8Array(sz),
    birthGen: new Uint8Array(sz),
    aliveIndices: new Uint32Array(Math.min(MAX_ALIVE, sz)),
    aliveCount: 0,
    _prev: new Uint8Array(sz),
    _sx: new Uint8Array(sz),
    _sy: new Uint8Array(sz),
  }
}

// pack a survival/birth set into a bitmask: bit k set iff k is in the set.
// Moore tops out at 26 neighbors, von Neumann at 6 — both fit in 32 bits.
function packBits(xs: number[]): number {
  let bits = 0 >>> 0
  for (const x of xs) if (x >= 0 && x < 32) bits |= (1 << x) >>> 0
  return bits >>> 0
}

// step advances the grid by one generation. writes into `next`.
export function step(grid: Grid, next: Grid, rule: Rule, gen: number): { alive: number } {
  if (rule.neighborhood === 'M') return stepMoore(grid, next, rule, gen)
  return stepNeumann(grid, next, rule, gen)
}

// --- Moore (26-neighbor) via separable 3D convolution ------------------------

function stepMoore(grid: Grid, next: Grid, rule: Rule, gen: number): { alive: number } {
  const { n, cells, birthDensity, birthGen, _prev: prev, _sx: sx, _sy: sy } = grid
  const nn = n * n
  const size = nn * n
  const full = rule.states - 1
  const survBits = packBits(rule.survival)
  const birthBits = packBits(rule.birth)
  const hasDecay = rule.states > 2

  // build prev: 1 where cell was full last step.
  // a single linear sweep, better cache behavior than a per-axis pass later.
  for (let i = 0; i < size; i++) prev[i] = cells[i] === full ? 1 : 0

  // X pass: 3-wide sum along x, toroidal wrap.
  // hoist row-base outside inner loop; the branchless edges for x=0 and x=n-1
  // are handled by index conditionals instead of `% n` to keep it integer-fast.
  for (let z = 0; z < n; z++) {
    const zOff = z * nn
    for (let y = 0; y < n; y++) {
      const row = zOff + y * n
      const rowEnd = row + n - 1
      // inner loop handles 1..n-2 fully (no wrap branches), edges handled after
      // edge x=0: neighbor -1 wraps to n-1
      sx[row] = prev[rowEnd] + prev[row] + prev[row + 1]
      // inner x=1..n-2 (plain neighbors)
      for (let x = 1; x < n - 1; x++) {
        const i = row + x
        sx[i] = prev[i - 1] + prev[i] + prev[i + 1]
      }
      // edge x=n-1: neighbor +1 wraps to 0
      sx[rowEnd] = prev[rowEnd - 1] + prev[rowEnd] + prev[row]
    }
  }

  // Y pass: 3-wide sum along y (±n), toroidal wrap.
  for (let z = 0; z < n; z++) {
    const zOff = z * nn
    // y=0 (wrap: y-1 -> y=n-1)
    {
      const rowY0 = zOff
      const rowYlast = zOff + (n - 1) * n
      const rowY1 = zOff + n
      for (let x = 0; x < n; x++) {
        sy[rowY0 + x] = sx[rowYlast + x] + sx[rowY0 + x] + sx[rowY1 + x]
      }
    }
    // y=1..n-2
    for (let y = 1; y < n - 1; y++) {
      const row = zOff + y * n
      const rowM = row - n
      const rowP = row + n
      for (let x = 0; x < n; x++) {
        sy[row + x] = sx[rowM + x] + sx[row + x] + sx[rowP + x]
      }
    }
    // y=n-1 (wrap: y+1 -> y=0)
    {
      const rowYlast = zOff + (n - 1) * n
      const rowYprev = zOff + (n - 2) * n
      const rowY0 = zOff
      for (let x = 0; x < n; x++) {
        sy[rowYlast + x] = sx[rowYprev + x] + sx[rowYlast + x] + sx[rowY0 + x]
      }
    }
  }

  // Z pass: combine sy slices along z (±nn), apply rule inline, emit next state.
  // this is the fused "final count + rule application" pass — one sweep.
  const nextCells = next.cells
  const nextBD = next.birthDensity
  const nextBG = next.birthGen
  nextCells.fill(0)
  nextBD.set(birthDensity)
  nextBG.set(birthGen)

  const alive = next.aliveIndices
  const aliveCap = alive.length
  let aliveCount = 0
  const gen8 = gen & 0xff

  // slice offsets for z-1, z, z+1 (wrap handled by branches on z == 0 / n-1)
  for (let z = 0; z < n; z++) {
    const zOff = z * nn
    const zmOff = z === 0 ? (n - 1) * nn : zOff - nn
    const zpOff = z === n - 1 ? 0 : zOff + nn
    for (let i = 0; i < nn; i++) {
      const idx = zOff + i
      const count = sy[zmOff + i] + sy[idx] + sy[zpOff + i] - prev[idx]
      const cur = cells[idx]
      let nv = 0
      if (cur === full) {
        if ((survBits >>> count) & 1) {
          nv = full
        } else if (hasDecay) {
          nv = full - 1
        }
      } else if (cur > 0) {
        nv = cur - 1
      } else {
        if ((birthBits >>> count) & 1) {
          nv = full
          nextBD[idx] = count
          nextBG[idx] = gen8
        }
      }
      if (nv !== 0) {
        nextCells[idx] = nv
        if (aliveCount < aliveCap) alive[aliveCount++] = idx
      }
    }
  }

  next.aliveCount = aliveCount
  // liveOnly = cells at full vitality (what the next step will read as prev)
  // but we return the visible alive count (includes decay states) so the HUD
  // matches what the user sees.
  return { alive: aliveCount }
}

// --- von Neumann (6-neighbor) — direct reads -------------------------------

function stepNeumann(grid: Grid, next: Grid, rule: Rule, gen: number): { alive: number } {
  const { n, cells, birthDensity, birthGen } = grid
  const nn = n * n
  const full = rule.states - 1
  const survBits = packBits(rule.survival)
  const birthBits = packBits(rule.birth)
  const hasDecay = rule.states > 2

  const nextCells = next.cells
  const nextBD = next.birthDensity
  const nextBG = next.birthGen
  nextCells.fill(0)
  nextBD.set(birthDensity)
  nextBG.set(birthGen)

  const alive = next.aliveIndices
  const aliveCap = alive.length
  let aliveCount = 0
  const gen8 = gen & 0xff

  for (let z = 0; z < n; z++) {
    const zOff = z * nn
    const zmOff = z === 0 ? (n - 1) * nn : zOff - nn
    const zpOff = z === n - 1 ? 0 : zOff + nn
    for (let y = 0; y < n; y++) {
      const yRow = y * n
      const yOff  = zOff + yRow
      const ymOff = y === 0 ? zOff + (n - 1) * n : yOff - n
      const ypOff = y === n - 1 ? zOff : yOff + n
      const zmRow = zmOff + yRow
      const zpRow = zpOff + yRow
      for (let x = 0; x < n; x++) {
        const xm = x === 0 ? n - 1 : x - 1
        const xp = x === n - 1 ? 0 : x + 1
        const idx = yOff + x
        // a neighbor contributes 1 iff it was at full vitality last step
        const c =
          (cells[yOff + xm] === full ? 1 : 0) +
          (cells[yOff + xp] === full ? 1 : 0) +
          (cells[ymOff + x] === full ? 1 : 0) +
          (cells[ypOff + x] === full ? 1 : 0) +
          (cells[zmRow + x] === full ? 1 : 0) +
          (cells[zpRow + x] === full ? 1 : 0)
        const cur = cells[idx]
        let nv = 0
        if (cur === full) {
          if ((survBits >>> c) & 1) nv = full
          else if (hasDecay) nv = full - 1
        } else if (cur > 0) {
          nv = cur - 1
        } else if ((birthBits >>> c) & 1) {
          nv = full
          nextBD[idx] = c
          nextBG[idx] = gen8
        }
        if (nv !== 0) {
          nextCells[idx] = nv
          if (aliveCount < aliveCap) alive[aliveCount++] = idx
        }
      }
    }
  }
  next.aliveCount = aliveCount
  return { alive: aliveCount }
}

// --- seed patterns --------------------------------------------------------

function refreshAliveList(grid: Grid) {
  const { cells, aliveIndices } = grid
  const cap = aliveIndices.length
  let c = 0
  for (let i = 0; i < cells.length && c < cap; i++) {
    if (cells[i] !== 0) aliveIndices[c++] = i
  }
  grid.aliveCount = c
}

export function seedRandomSphere(grid: Grid, rule: Rule, rand: () => number, densityOverride?: number): number {
  const { n, cells, birthDensity, birthGen } = grid
  cells.fill(0); birthDensity.fill(0); birthGen.fill(0)
  const full = rule.states - 1
  const r = Math.max(2, Math.floor(n * 0.28))
  const cx = n / 2, cy = n / 2, cz = n / 2
  const d = densityOverride ?? rule.density
  const nn = n * n

  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - cx + 0.5, dy = y - cy + 0.5, dz = z - cz + 0.5
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < r && rand() < d) {
          const i = x + n * y + nn * z
          cells[i] = full
          birthDensity[i] = 5 + Math.floor(rand() * 15)
          birthGen[i] = 0
        }
      }
    }
  }
  refreshAliveList(grid)
  return grid.aliveCount
}

export function seedSingleVoxel(grid: Grid, rule: Rule): number {
  const { n, cells, birthDensity, birthGen } = grid
  cells.fill(0); birthDensity.fill(0); birthGen.fill(0)
  const full = rule.states - 1
  const c = Math.floor(n / 2)
  const i = c + n * c + n * n * c
  cells[i] = full
  birthDensity[i] = 13
  birthGen[i] = 0
  refreshAliveList(grid)
  return 1
}

export function seedPlane(grid: Grid, rule: Rule, rand: () => number): number {
  const { n, cells, birthDensity, birthGen } = grid
  cells.fill(0); birthDensity.fill(0); birthGen.fill(0)
  const full = rule.states - 1
  const midZ = Math.floor(n / 2)
  const nn = n * n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (rand() < 0.35) {
        const i = x + n * y + nn * midZ
        cells[i] = full
        birthDensity[i] = 5 + Math.floor(rand() * 15)
      }
    }
  }
  refreshAliveList(grid)
  return grid.aliveCount
}

export type SeedKind = 'sphere' | 'single' | 'plane'

export function seed(kind: SeedKind, grid: Grid, rule: Rule, rand: () => number, densityOverride?: number): number {
  if (kind === 'single') return seedSingleVoxel(grid, rule)
  if (kind === 'plane') return seedPlane(grid, rule, rand)
  return seedRandomSphere(grid, rule, rand, densityOverride)
}
