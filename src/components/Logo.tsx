import { useId } from 'react'

type Props = { size?: number; className?: string }

// pirt,e mark — a postage-stamp silhouette. a rounded square is masked
// with evenly-spaced circular "perforations" along every edge, producing
// the scalloped stamp outline. inside, a single punched-out hole sits at
// the centroid as the stamp's mark. the whole glyph does a subtle press
// animation every few seconds — a quick compress + bounce, like the
// moment a rubber stamp lands. `currentColor` drives the fill.
export default function Logo({ size = 22, className = '' }: Props) {
  const maskId = `pirte-stamp-mask-${useId().replace(/:/g, '_')}`
  // 7 perforations per edge at a 5-unit cadence (viewBox 40×40)
  const perfs: { cx: number; cy: number }[] = []
  for (let i = 5; i < 40; i += 5) {
    perfs.push({ cx: i,  cy: 2  })  // top
    perfs.push({ cx: i,  cy: 38 })  // bottom
    perfs.push({ cx: 2,  cy: i  })  // left
    perfs.push({ cx: 38, cy: i  })  // right
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className={`pirte-logo ${className}`}
    >
      <defs>
        <mask id={maskId}>
          {/* show everything by default */}
          <rect width="40" height="40" fill="white" />
          {/* punch circular perforations around the edges */}
          {perfs.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r="1.7" fill="black" />
          ))}
          {/* punch the centroid mark */}
          <circle cx="20" cy="20" r="2.4" fill="black" />
        </mask>
      </defs>

      <g className="pirte-stamp">
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="3"
          fill="currentColor"
          mask={`url(#${maskId})`}
        />
      </g>
    </svg>
  )
}
