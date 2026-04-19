export type Card = {
  num: string     // roman numeral
  name: string
  glyph: string
  meaning: string
  reversed?: string
}

export const MAJOR: Card[] = [
  { num: '0',     name: 'the fool',         glyph: '✦', meaning: 'leap of faith · new beginnings',           reversed: 'recklessness · hesitation' },
  { num: 'i',     name: 'the magician',     glyph: '⚡', meaning: 'will · manifestation · intention',         reversed: 'trickery · blocked power' },
  { num: 'ii',    name: 'high priestess',   glyph: '☾', meaning: 'intuition · unseen knowing',                reversed: 'secrets withheld · disconnection' },
  { num: 'iii',   name: 'the empress',      glyph: '♀', meaning: 'abundance · creativity · nurture',          reversed: 'stagnation · neglect of self' },
  { num: 'iv',    name: 'the emperor',      glyph: '♛', meaning: 'structure · authority · order',             reversed: 'rigidity · domination' },
  { num: 'v',     name: 'the hierophant',   glyph: '✚', meaning: 'tradition · teaching · lineage',            reversed: 'rebellion · unlearning' },
  { num: 'vi',    name: 'the lovers',       glyph: '♡', meaning: 'choice · union · alignment',                reversed: 'misalignment · avoidance' },
  { num: 'vii',   name: 'the chariot',      glyph: '▶', meaning: 'drive · direction · will to move',          reversed: 'scattered forces · stalling' },
  { num: 'viii',  name: 'strength',         glyph: '∞', meaning: 'gentle power · courage · patience',         reversed: 'self-doubt · burnout' },
  { num: 'ix',    name: 'the hermit',       glyph: '✱', meaning: 'solitude · seeking · inner light',          reversed: 'isolation · lost signal' },
  { num: 'x',     name: 'wheel of fortune', glyph: '◎', meaning: 'cycles · luck · turning',                    reversed: 'stuck loop · resistance' },
  { num: 'xi',    name: 'justice',          glyph: '⚖', meaning: 'truth · balance · accountability',          reversed: 'unfairness · avoidance' },
  { num: 'xii',   name: 'the hanged man',   glyph: '☩', meaning: 'surrender · pause · new angle',             reversed: 'sacrifice for nothing · delay' },
  { num: 'xiii',  name: 'death',            glyph: '☠', meaning: 'transformation · ending · release',         reversed: 'clinging · stalled change' },
  { num: 'xiv',   name: 'temperance',       glyph: '⚘', meaning: 'balance · patience · blending',             reversed: 'excess · imbalance' },
  { num: 'xv',    name: 'the devil',        glyph: '☿', meaning: 'attachment · shadow · pattern',             reversed: 'breaking chains · awareness' },
  { num: 'xvi',   name: 'the tower',        glyph: '⚠', meaning: 'sudden shift · revelation · freedom',       reversed: 'averted crisis · slow tremor' },
  { num: 'xvii',  name: 'the star',         glyph: '★', meaning: 'hope · renewal · quiet faith',              reversed: 'despair · drought' },
  { num: 'xviii', name: 'the moon',         glyph: '☽', meaning: 'illusion · dream · intuition',              reversed: 'clarity · fear lifting' },
  { num: 'xix',   name: 'the sun',          glyph: '☀', meaning: 'clarity · joy · vitality',                  reversed: 'dimmed light · overexposure' },
  { num: 'xx',    name: 'judgement',        glyph: '⚯', meaning: 'awakening · calling · reckoning',           reversed: 'self-doubt · avoidance' },
  { num: 'xxi',   name: 'the world',        glyph: '⊙', meaning: 'completion · wholeness · integration',      reversed: 'nearly there · loose end' },
]

export const SPREADS: Record<number, string[]> = {
  1: ['present'],
  3: ['past', 'present', 'future'],
  5: ['situation', 'challenge', 'past', 'future', 'outcome'],
}

export type Drawn = { card: Card; reversed: boolean; position: string }

export function drawSpread(size: 1 | 3 | 5): Drawn[] {
  const deck = [...MAJOR]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const picks = deck.slice(0, size)
  const positions = SPREADS[size]
  return picks.map((c, i) => ({ card: c, reversed: Math.random() < 0.25, position: positions[i] }))
}

const W = 13 // card width
const H = 9  // card height

export function renderCard(drawn: Drawn | null, revealPct: number): string[] {
  const lines: string[] = []
  if (!drawn || revealPct === 0) {
    // back of card
    lines.push('╭───────────╮')
    for (let i = 0; i < H - 2; i++) {
      if (i === Math.floor((H - 2) / 2)) lines.push('│  · · · ·  │')
      else lines.push('│ · · · · · │')
    }
    lines.push('╰───────────╯')
    return lines
  }
  const { card, reversed } = drawn
  const num = card.num.padEnd(W - 4).slice(0, W - 4)
  const nameRaw = reversed ? `(${card.name})` : card.name
  const name = nameRaw.length > W - 4 ? nameRaw.slice(0, W - 4) : nameRaw
  const centerPad = Math.floor((W - 2 - name.length) / 2)
  const nameLine = ' '.repeat(centerPad) + name + ' '.repeat(W - 2 - centerPad - name.length)
  const glyphPad = Math.floor((W - 3) / 2)
  const glyphLine = ' '.repeat(glyphPad) + card.glyph + ' '.repeat(W - 3 - glyphPad)

  lines.push('╭───────────╮')
  lines.push(`│ ${num}│`)
  lines.push('│           │')
  lines.push(`│${reversed ? ' '.repeat(W - 2) : glyphLine}│`)
  lines.push('│           │')
  lines.push('│           │')
  lines.push(`│${nameLine}│`)
  lines.push('│           │')
  lines.push('╰───────────╯')

  if (reversed) {
    // vertically flip everything except corners to suggest "reversed" card
    const mid = lines.slice(1, H - 1).reverse()
    return [lines[0], ...mid, lines[H - 1]]
  }
  return lines
}

export function joinCards(cards: string[][], gap = 3): string {
  if (cards.length === 0) return ''
  const rows = cards[0].length
  const spacer = ' '.repeat(gap)
  const lines: string[] = []
  for (let r = 0; r < rows; r++) {
    lines.push(cards.map((c) => c[r]).join(spacer))
  }
  return lines.join('\n')
}
