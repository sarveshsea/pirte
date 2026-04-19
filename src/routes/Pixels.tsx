import Tile from '../components/Tile'

export default function Pixels() {
  return (
    <Tile label="pixels" code="05" footer={<span>wip · paint by number</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">fetching image…</span>
      </div>
    </Tile>
  )
}
