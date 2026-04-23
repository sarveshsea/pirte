type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}

export default function Slider({ label, value, min, max, step = 1, onChange, format }: Props) {
  return (
    <label className="block min-w-0 text-[13px] text-[var(--color-dim)]">
      <span className="mb-1 flex min-w-0 items-center justify-between gap-3 tracking-[0.06em]">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-[var(--color-fg)]">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}
