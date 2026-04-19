import Tile from '../components/Tile'

export default function Ascii() {
  return (
    <Tile label="ascii" code="03" footer={<span>wip · drop image → text</span>}>
      <div className="grid h-[60vh] place-items-center text-[var(--color-dim)]">
        <span className="text-[11px] uppercase tracking-[0.2em]">drop or browse…</span>
      </div>
    </Tile>
  )
}
