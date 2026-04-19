import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-start justify-center gap-3">
      <pre className="text-[var(--color-fg)]">{`
404
route not found
`}</pre>
      <Link to="/" data-interactive className="text-[var(--color-dim)] hover:text-[var(--color-fg)]">
        ← back to index
      </Link>
    </div>
  )
}
