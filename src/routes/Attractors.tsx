import Tile from '../components/Tile'

export default function Attractors() {
  return (
    <Tile label="attractors" code="02" footer={<span>wip · lorenz / clifford / dejong</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">initializing integrator…</span>
      </div>
    </Tile>
  )
}
