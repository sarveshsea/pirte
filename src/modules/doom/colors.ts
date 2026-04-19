export type Kind =
  | 'blank'
  | 'wall_x_near' | 'wall_x_mid' | 'wall_x_far' | 'wall_x_mist'
  | 'wall_y_near' | 'wall_y_mid' | 'wall_y_far' | 'wall_y_mist'
  | 'door' | 'floor' | 'floor_near' | 'nukage' | 'exit'
  | 'imp' | 'imp_dead' | 'fireball'
  | 'pickup_health' | 'pickup_armor' | 'pickup_ammo'
  | 'pistol' | 'muzzle'
  | 'hud_sep' | 'hud_label' | 'hud_face'
  | 'hud_health' | 'hud_armor' | 'hud_ammo' | 'hud_counter'
  | 'overlay_box' | 'overlay_text'

export const KIND_COLOR: Record<Kind, string> = {
  blank:         '#000000',
  wall_x_near:   '#d6d4cf',
  wall_x_mid:    '#9a968e',
  wall_x_far:    '#5a574f',
  wall_x_mist:   '#2a2826',
  wall_y_near:   '#a8a49d',
  wall_y_mid:    '#706c65',
  wall_y_far:    '#3e3c37',
  wall_y_mist:   '#1e1c1a',
  door:          '#d2a248',
  floor_near:    '#5a4f3e',
  floor:         '#38332a',
  nukage:        '#66e04a',
  exit:          '#ffde3a',
  imp:           '#e04a1c',
  imp_dead:      '#7a2410',
  fireball:      '#ff9a28',
  pickup_health: '#ff4a4a',
  pickup_armor:  '#5aa8ff',
  pickup_ammo:   '#e8c84a',
  pistol:        '#8c8c8c',
  muzzle:        '#ffe66a',
  hud_sep:       '#6a6a6a',
  hud_label:     '#9a9a9a',
  hud_face:      '#e8e8e8',
  hud_health:    '#ff7a7a',
  hud_armor:     '#7ab8ff',
  hud_ammo:      '#ffd26a',
  hud_counter:   '#c0c0c0',
  overlay_box:   '#808080',
  overlay_text:  '#f0f0f0',
}

// precomputed opening span tags, keyed by kind
export const SPAN_OPEN: Record<Kind, string> = Object.fromEntries(
  (Object.keys(KIND_COLOR) as Kind[]).map((k) => [k, `<span style="color:${KIND_COLOR[k]}">`]),
) as Record<Kind, string>

export function toHTML(chars: string[][], kinds: Kind[][]): string {
  const rows = chars.length
  const cols = chars[0]?.length ?? 0
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
        if (run) line += SPAN_OPEN[cur as Kind] + escape(run) + '</span>'
        cur = k
        run = ch
      }
    }
    if (run && cur) line += SPAN_OPEN[cur] + escape(run) + '</span>'
    lineParts.push(line)
  }
  return lineParts.join('\n')
}

function escape(s: string): string {
  // glyphs are curated so <, >, & shouldn't appear; keep defensive swap cheap
  if (s.indexOf('<') < 0 && s.indexOf('>') < 0 && s.indexOf('&') < 0) return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
