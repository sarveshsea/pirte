// small ascii bitmaps for entities. ' ' (space) is transparent; any other
// glyph is drawn as-is. all sprites are rectangular char grids.

export type Sprite = string[]

export const IMP_IDLE: Sprite = [
  '   ▄▄▄   ',
  '  ▐▀▀▌   ',
  '  █▀◣◢▀█ ',
  ' ▐ ▌▄▐ ▌ ',
  '  ▜▄▄▄▛  ',
  '   █ █   ',
  '  ▐▌ ▐▌  ',
  '  ▀   ▀  ',
]

export const IMP_ATTACK: Sprite = [
  '   ▄▄▄   ',
  '  ▐██▌   ',
  '  █◤◥◤◥█ ',
  ' ▐▐▌▲▐▌▌ ',
  '  ▜▀▀▀▛  ',
  '  ╱█ █╲  ',
  ' ● ▐▌ ▐▌●',
  '         ',
]

export const IMP_DEAD: Sprite = [
  '         ',
  '         ',
  '         ',
  '  ▄▄▄▄▄  ',
  ' ▄██░░██ ',
  '▐░▀▄▄▄▀░▌',
  ' ▀▄▄▄▄▄▀ ',
  '         ',
]

export const FIREBALL: Sprite = [
  '  ▄▄  ',
  ' ▄██▄ ',
  '▐████▌',
  ' ▀██▀ ',
  '  ▀▀  ',
]

export const HEALTH_PACK: Sprite = [
  '┌───┐',
  '│ ╋ │',
  '│╋╋╋│',
  '│ ╋ │',
  '└───┘',
]

export const ARMOR: Sprite = [
  ' ╱▔▔╲ ',
  '╱    ╲',
  '│ ▓▓ │',
  '│ ▓▓ │',
  ' ╲__╱ ',
]

export const AMMO_CLIP: Sprite = [
  '┌──┐',
  '│▌▐│',
  '│▌▐│',
  '│▌▐│',
  '└──┘',
]

export const EXIT_SWITCH: Sprite = [
  '█████',
  '█▄▄▄█',
  '█▐E▌█',
  '█▀▀▀█',
  '█████',
]

// pistol drawn at the bottom of the screen; muzzle flash is the alt frame
export const PISTOL_IDLE: Sprite = [
  '     ╱▔▔▔╲     ',
  '    ╱     ╲    ',
  '   │  ██   │   ',
  '   │  ██   │   ',
  '   │  ██   │   ',
  '   │  ██   │   ',
]

export const PISTOL_FIRE: Sprite = [
  '   ░▒▓█▓▒░     ',
  '  ░▒▓███▓▒░    ',
  '   │  ██   │   ',
  '   │  ██   │   ',
  '   │  ██   │   ',
  '   │  ██   │   ',
]
