import Tile from '../components/Tile'

export default function Terminal() {
  return (
    <Tile label="terminal" code="04" footer={<span>wip · ← → cycle scenes</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">booting scenes…</span>
      </div>
    </Tile>
  )
}
