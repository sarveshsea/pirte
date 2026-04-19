export type Scene = {
  name: string
  reset(cols: number, rows: number): void
  frame(t: number): string
}
