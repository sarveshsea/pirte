/*
 * shared interface for the modular background wallpaper programs.
 * each program is stateful: it owns a cell grid sized (cols, rows)
 * and gets asked to step + paint on every frame.
 *
 * cursor — viewport px; active=false when the pointer has left the
 *          window. programs can use it to bias nearby cells.
 * ripples — click pulses; program can choose to react or ignore.
 */

export type BgCursor = { x: number; y: number; active: boolean }
export type BgRipple = { x: number; y: number; age: number }

export type BgProgram = {
  name: string
  reset(cols: number, rows: number, cell: number): void
  frame(
    ctx: CanvasRenderingContext2D,
    t: number,
    dt: number,
    cursor: BgCursor,
    ripples: BgRipple[],
  ): void
}

export type BgFactory = () => BgProgram
