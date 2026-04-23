// 3D cellular automata rules in the S/B/C/N format used by the 3D-CA community
// (Mirek Wojtowicz / Softology conventions).
//
//   S — survival: neighbor counts for an alive cell to stay alive
//   B — birth:    neighbor counts for a dead cell to become alive
//   C — states:   how many generations an alive cell persists before dying
//                 (if C > 2, a cell that fails its survival test enters a
//                 decay chain — state C-1, C-2, ... 1, 0 — during which it
//                 can no longer give birth but still occupies space)
//   N — neighborhood: 'M' (Moore, 26 neighbors) or 'N' (von Neumann, 6)
//
// these rules are classics — documented in Wojtowicz's 1988 paper and
// catalogued across Golly, Softology, and 3dcatalog.

export type Neighborhood = 'M' | 'N'

export type Rule = {
  id: string
  name: string
  blurb: string
  survival: number[]
  birth: number[]
  states: number
  neighborhood: Neighborhood
  // suggested seed density (fraction of cells alive at start)
  density: number
}

// helper: expand a range like [13,26] into [13,14,...,26]
const range = (a: number, b: number) => {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

export const RULES: Rule[] = [
  {
    id: 'amoeba',
    name: 'amoeba',
    blurb: 'fluid blobs that pulse and split',
    survival: range(9, 26),
    birth: [5, 6, 7, 12, 13, 15],
    states: 5,
    neighborhood: 'M',
    density: 0.38,
  },
  {
    id: 'clouds',
    name: 'clouds',
    blurb: 'billowing volumes, stable masses',
    survival: range(13, 26),
    birth: [13, 14],
    states: 2,
    neighborhood: 'M',
    density: 0.4,
  },
  {
    id: '5766',
    name: '5766',
    blurb: 'classic period-2 oscillators',
    survival: [6, 7, 8],
    birth: [6],
    states: 6,
    neighborhood: 'M',
    density: 0.15,
  },
  {
    id: 'builder',
    name: 'builder',
    blurb: 'crystalline lattices accrete outward',
    survival: [2, 6, 9],
    birth: [4, 6, 8, 9],
    states: 10,
    neighborhood: 'M',
    density: 0.06,
  },
  {
    id: 'crystal',
    name: 'crystal',
    blurb: 'axis-aligned snowflake growth',
    survival: range(0, 6),
    birth: [1, 3],
    states: 2,
    neighborhood: 'N',
    density: 0.008,
  },
  {
    id: 'pyroclastic',
    name: 'pyroclastic',
    blurb: 'explosive billowing with decay trails',
    survival: [4, 5, 6, 7],
    birth: [6, 7, 8],
    states: 10,
    neighborhood: 'M',
    density: 0.18,
  },
  {
    id: 'slow-decay',
    name: 'slow decay',
    blurb: 'dense plateaus erode into dust',
    survival: range(13, 26),
    birth: range(13, 26),
    states: 5,
    neighborhood: 'M',
    density: 0.45,
  },
  {
    id: '445',
    name: '4 4 5',
    blurb: 'minimal survival — delicate filaments',
    survival: [4],
    birth: [4],
    states: 5,
    neighborhood: 'M',
    density: 0.1,
  },
  {
    id: 'spiky-growth',
    name: 'spiky growth',
    blurb: 'needle-like axis extensions',
    survival: range(0, 3),
    birth: [1, 3],
    states: 10,
    neighborhood: 'N',
    density: 0.004,
  },
  {
    id: 'shells',
    name: 'shells',
    blurb: 'layered concentric hollow shells',
    survival: [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 24, 26],
    birth: [5, 7, 8, 10, 11, 13, 15, 16, 18, 22, 24, 25],
    states: 10,
    neighborhood: 'M',
    density: 0.5,
  },
  {
    id: 'ripple',
    name: 'ripple',
    blurb: 'expanding wavefronts with interference',
    survival: [6, 7, 8, 9, 10, 11, 12],
    birth: [5, 6, 7, 12],
    states: 8,
    neighborhood: 'M',
    density: 0.22,
  },
  {
    id: 'architects',
    name: 'architects',
    blurb: 'branching frameworks — minecraft cathedrals',
    survival: [4, 5, 8, 9],
    birth: [4, 8, 9],
    states: 8,
    neighborhood: 'M',
    density: 0.12,
  },
]

export function ruleById(id: string): Rule {
  return RULES.find((r) => r.id === id) ?? RULES[0]
}

export function formatRule(r: Rule): string {
  const fmt = (xs: number[]) => {
    // collapse consecutive runs like 13,14,15...26 → "13-26"
    if (xs.length === 0) return '∅'
    const sorted = [...xs].sort((a, b) => a - b)
    const parts: string[] = []
    let i = 0
    while (i < sorted.length) {
      let j = i
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
      parts.push(j === i ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`)
      i = j + 1
    }
    return parts.join(',')
  }
  return `${fmt(r.survival)} / ${fmt(r.birth)} / ${r.states} / ${r.neighborhood}`
}
