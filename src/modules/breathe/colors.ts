export type Phase = 'inhale' | 'hold1' | 'exhale' | 'hold2'
export const PHASE_LABEL: Record<Phase, string> = {
  inhale: 'inhale', hold1: 'hold', exhale: 'exhale', hold2: 'hold',
}
export const PHASE_ORDER: Phase[] = ['inhale', 'hold1', 'exhale', 'hold2']

export type Kind = 'blank' | 'faint' | 'dim' | 'mid' | 'bright' | 'ring'

type Palette = Record<Exclude<Kind, 'blank'>, string>

// cool blue on the in-breath, warm amber while held, soft green on release,
// muted grey during the bottom hold. each phase has 4 intensity steps + a ring
// color for the outline.
const PALETTES: Record<Phase, Palette> = {
  inhale: { faint: '#254e70', dim: '#3a7fb8', mid: '#5ea8e0', bright: '#a8dcff', ring: '#cfeaff' },
  hold1:  { faint: '#6a4820', dim: '#a57230', mid: '#d69a48', bright: '#ffcf6a', ring: '#ffe28a' },
  exhale: { faint: '#234b24', dim: '#3f7c42', mid: '#68af6c', bright: '#9ee3a0', ring: '#c0f3c4' },
  hold2:  { faint: '#2e2e2e', dim: '#525252', mid: '#7a7a7a', bright: '#b0b0b0', ring: '#d0d0d0' },
}

export function colorFor(phase: Phase, kind: Kind): string | null {
  if (kind === 'blank') return null
  return PALETTES[phase][kind]
}

export function phaseAccent(phase: Phase): string {
  return PALETTES[phase].bright
}

export function toHTML(chars: string[][], kinds: Kind[][], phase: Phase): string {
  const rows = chars.length
  const cols = chars[0]?.length ?? 0
  const palette = PALETTES[phase]
  const lineParts: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    let run = ''
    let cur: Kind | null = null
    for (let x = 0; x < cols; x++) {
      const k = kinds[y][x]
      const ch = chars[y][x]
      if (k === cur) {
        run += ch
      } else {
        if (run) line += emit(palette, cur as Kind, run)
        cur = k
        run = ch
      }
    }
    if (run && cur) line += emit(palette, cur, run)
    lineParts.push(line)
  }
  return lineParts.join('\n')
}

function emit(palette: Palette, kind: Kind, s: string): string {
  if (kind === 'blank') return s
  return `<span style="color:${palette[kind]}">${s}</span>`
}
