// 3-wide x 5-tall seven-segment ascii digits
export const GLYPHS: Record<string, string[]> = {
  '0': [' _ ', '| |', '   ', '| |', '|_|'],
  '1': ['   ', '  |', '   ', '  |', '  |'],
  '2': [' _ ', '  |', ' _|', '|  ', '|_ '],
  '3': [' _ ', '  |', ' _|', '  |', ' _|'],
  '4': ['   ', '|_|', ' _|', '  |', '  |'],
  '5': [' _ ', '|  ', ' _ ', '  |', ' _|'],
  '6': [' _ ', '|  ', ' _ ', '| |', '|_|'],
  '7': [' _ ', '  |', '   ', '  |', '  |'],
  '8': [' _ ', '| |', ' _ ', '| |', '|_|'],
  '9': [' _ ', '| |', ' _|', '  |', '  |'],
  ':': ['   ', ' . ', '   ', ' . ', '   '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
}

export function renderSevenSegment(text: string): string {
  const lines = ['', '', '', '', '']
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let i = 0; i < 5; i++) lines[i] += g[i] + ' '
  }
  return lines.join('\n')
}
