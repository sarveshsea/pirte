import Tile from '../components/Tile'

export default function Kaleidoscope() {
  return (
    <Tile label="kaleidoscope" code="07" footer={<span>wip · n-fold mirror</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">seeding field…</span>
      </div>
    </Tile>
  )
}
