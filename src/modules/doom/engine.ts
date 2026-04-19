// step (a) scaffold: static banner. step (b) swaps in the raycaster.

export type Doom = {
  reset(cols: number, rows: number): void
  frame(t: number): string
}

export function createDoom(): Doom {
  let cols = 80
  let rows = 30

  const banner = [
    '    ____                        ',
    '   |    \\    ___    ___   _ __  ',
    '   | |\\  |  / _ \\  / _ \\ | |_ \\ ',
    '   | |/  | | (_) || (_) || | | |',
    '   |____/   \\___/  \\___/ |_| |_|',
    '                                ',
    '           e1m1 · hangar         ',
    '                                ',
    '        booting raycaster...    ',
  ]

  return {
    reset(c, r) { cols = c; rows = r },
    frame() {
      const buf: string[] = []
      const top = Math.max(0, Math.floor((rows - banner.length) / 2))
      for (let y = 0; y < rows; y++) {
        const line = banner[y - top]
        if (line) {
          const pad = Math.max(0, Math.floor((cols - line.length) / 2))
          buf.push(' '.repeat(pad) + line)
        } else {
          buf.push('')
        }
      }
      return buf.join('\n')
    },
  }
}
