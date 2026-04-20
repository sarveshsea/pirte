type Props = { query: string }

const HINT_TAGS = ['bear', 'cat', 'flip', 'cry', 'happy', 'love', 'sparkle']

export default function EmptyState({ query }: Props) {
  return (
    <div className="grid h-full place-items-center px-4 text-center text-[13px] text-[var(--color-dim)]">
      <div className="flex max-w-sm flex-col gap-3">
        <div>
          no matches for "<span className="text-[var(--color-fg)]">{query}</span>"
        </div>
        <div className="flex flex-wrap justify-center gap-1 text-[11px]">
          <span className="text-[var(--color-dim)]">try </span>
          {HINT_TAGS.map((t, i) => (
            <span key={t}>
              <span className="text-[var(--color-fg)]">{t}</span>
              {i < HINT_TAGS.length - 1 ? <span className="text-[var(--color-dim)]"> · </span> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
