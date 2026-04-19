import Tile from '../components/Tile'

export default function Fractals() {
  return (
    <Tile label="fractals" code="01" footer={<span>wip · mandelbrot + julia shader next</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">loading shader…</span>
      </div>
    </Tile>
  )
}
