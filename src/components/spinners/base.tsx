import { useEffect, useState, type CSSProperties } from 'react'
import { intervalLoop } from '../../lib/rafLoop'

export interface SpinnerProps {
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
}

interface SpinnerImplProps extends SpinnerProps {
  frames: readonly string[]
  interval: number
}

// shared renderer — ported from expo-agent-spinners (react-native → web span)
export function Spinner({
  frames,
  interval,
  size = 24,
  color,
  className,
  style,
}: SpinnerImplProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    // visibility-aware: spinners don't tick while the tab is hidden. matters
    // most for the RouteLoader fallback, which mounts briefly on every lazy
    // route switch — previously those intervals stayed live on background tabs.
    return intervalLoop(() => setFrame((i) => (i + 1) % frames.length), interval)
  }, [frames, interval])

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size,
        lineHeight: 1.3,
        color,
        whiteSpace: 'pre',
        fontFamily: 'var(--font-mono)',
        fontVariantLigatures: 'none',
        ...style,
      }}
      aria-hidden
    >
      {frames[frame]}
    </span>
  )
}

export function makeSpinner(
  name: string,
  frames: readonly string[],
  interval: number,
) {
  const C = (props: SpinnerProps) => (
    <Spinner frames={frames} interval={interval} {...props} />
  )
  C.displayName = name
  C.frames = frames
  C.interval = interval
  return C
}
