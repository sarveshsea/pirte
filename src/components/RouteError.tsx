import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode; resetKey?: string | number }
type State = { err: Error | null }

export default class RouteError extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[pirte] route error:', err, info)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null })
  }

  reset = () => this.setState({ err: null })

  render() {
    const { err } = this.state
    if (!err) return this.props.children
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col justify-center gap-4">
        <pre className="m-0 whitespace-pre text-[var(--color-fg)]">{`
module crashed

${err.name}: ${err.message}
`}</pre>
        <details className="text-[11px] text-[var(--color-dim)]">
          <summary className="cursor-none select-none">stack</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[10px] leading-[1.5]">{err.stack ?? '(no stack)'}</pre>
        </details>
        <div className="flex items-center gap-3 text-[12px]">
          <button data-interactive onClick={this.reset}>[ restart module ]</button>
          <Link to="/" data-interactive className="text-[var(--color-dim)] hover:text-[var(--color-fg)]">← back to index</Link>
        </div>
      </div>
    )
  }
}
