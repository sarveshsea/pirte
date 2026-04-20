import { useEffect, useRef } from 'react'
import { noise2 } from '../lib/perlin'

// algorithmic liquid hourglass. svg with two chambers clipped to triangles;
// the liquid surface is a perlin-waved path redrawn every frame, draining the
// top into the bottom over `cycleSec`. when empty, the whole thing flips 180°
// (the "twist") and starts over.
//
// viewBox is 40 × 60; the logo is normally rendered small (≈26px tall) but
// scales cleanly for the splash.

type Props = {
  size?: number          // height in px
  className?: string
  cycleSec?: number      // seconds for top chamber to fully drain
  paused?: boolean
  twistMs?: number       // duration of the flip animation
  /** if > 0, start empty-empty and fill the top chamber over this many seconds
   *  before the first twist. used by the splash intro. */
  introFillSec?: number
}

const VB_W = 40
const VB_H = 60
const TOP_Y_TOP = 4.5
const TOP_Y_BOT = 29.2
const BOT_Y_TOP = 30.8
const BOT_Y_BOT = 55.5
const NECK_HALF = 1.0
const GLASS_L = 5
const GLASS_R = 35

const topLeft  = (y: number) => GLASS_L + (19 - GLASS_L) * (y - TOP_Y_TOP) / (TOP_Y_BOT - TOP_Y_TOP)
const topRight = (y: number) => GLASS_R - (GLASS_R - 21) * (y - TOP_Y_TOP) / (TOP_Y_BOT - TOP_Y_TOP)
const botLeft  = (y: number) => 19 - (19 - GLASS_L) * (y - BOT_Y_TOP) / (BOT_Y_BOT - BOT_Y_TOP)
const botRight = (y: number) => 21 + (GLASS_R - 21) * (y - BOT_Y_TOP) / (BOT_Y_BOT - BOT_Y_TOP)

function buildTopLiquid(fill: number, t: number): string {
  if (fill <= 0.001) return ''
  const surfY = TOP_Y_TOP + (TOP_Y_BOT - TOP_Y_TOP) * (1 - fill)
  const xL = topLeft(surfY)
  const xR = topRight(surfY)
  const samples = 16
  const amp = Math.min(0.55, fill * 0.9)
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const f = i / samples
    const x = xL + (xR - xL) * f
    const wave = Math.sin(f * 7 + t * 2.4) * amp * 0.4
             + noise2(f * 3 + t * 0.6, t * 0.4) * amp
    const y = surfY + wave
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
  }
  d += `L ${(19 + NECK_HALF).toFixed(2)} ${TOP_Y_BOT} `
  d += `L ${(19 - NECK_HALF).toFixed(2)} ${TOP_Y_BOT} Z`
  return d
}

function buildBotLiquid(fill: number, t: number): string {
  if (fill <= 0.001) return ''
  const surfY = BOT_Y_BOT - (BOT_Y_BOT - BOT_Y_TOP) * fill
  const xL = botLeft(surfY)
  const xR = botRight(surfY)
  const samples = 16
  const amp = Math.min(0.55, fill * 0.9)
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const f = i / samples
    const x = xL + (xR - xL) * f
    const wave = Math.sin(f * 7 + t * 2.1 + 1.9) * amp * 0.4
             + noise2(f * 3 + t * 0.6 + 7.7, t * 0.4 + 3.3) * amp
    const y = surfY + wave
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
  }
  d += `L ${botRight(BOT_Y_BOT).toFixed(2)} ${BOT_Y_BOT} `
  d += `L ${botLeft(BOT_Y_BOT).toFixed(2)} ${BOT_Y_BOT} Z`
  return d
}

export default function Hourglass({
  size = 26,
  className = '',
  cycleSec = 8,
  paused = false,
  twistMs = 520,
  introFillSec = 0,
}: Props) {
  const topRef   = useRef<SVGPathElement>(null)
  const botRef   = useRef<SVGPathElement>(null)
  const rotorRef = useRef<SVGGElement>(null)
  const grain1   = useRef<SVGCircleElement>(null)
  const grain2   = useRef<SVGCircleElement>(null)
  const grain3   = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    let intro = introFillSec > 0
    let cycleStart = start
    let flips = 0

    const applyRotation = (deg: number) => {
      const el = rotorRef.current
      if (!el) return
      el.style.transition = `transform ${twistMs}ms cubic-bezier(0.65, 0.05, 0.28, 0.95)`
      el.style.transformOrigin = '50% 50%'
      el.style.transformBox = 'fill-box'
      el.style.transform = `rotate(${deg}deg)`
    }

    const loop = (now: number) => {
      if (!paused) {
        const tAbs = (now - start) / 1000
        let topFill = 1
        let botFill = 0

        if (intro) {
          const introT = Math.min(1, tAbs / introFillSec)
          topFill = introT
          botFill = 0
          if (introT >= 1) {
            // end of intro: trigger the twist, enter normal cycle
            intro = false
            cycleStart = now
            flips = 1
            applyRotation(flips * 180)
          }
        } else {
          const cycleT = (now - cycleStart) / 1000
          const phase = Math.min(1, cycleT / cycleSec)
          // flip-aware: on even flip count top drains, on odd count top fills
          // (because rotation has swapped which chamber is physically "up")
          const oriented = (flips % 2) === 0
          topFill = oriented ? (1 - phase) : phase
          botFill = oriented ? phase       : (1 - phase)
          if (phase >= 1) {
            flips++
            cycleStart = now
            applyRotation(flips * 180)
          }
        }

        if (topRef.current) topRef.current.setAttribute('d', buildTopLiquid(topFill, tAbs))
        if (botRef.current) botRef.current.setAttribute('d', buildBotLiquid(botFill, tAbs))

        // grains fall when the higher-visual chamber has something to shed.
        const fromTop = (flips % 2) === 0 && topFill > 0.05
        const fromBot = (flips % 2) === 1 && botFill > 0.05
        const showGrains = intro ? topFill > 0.1 : (fromTop || fromBot)
        const setG = (ref: { current: SVGCircleElement | null }, seed: number, r: number) => {
          const el = ref.current
          if (!el) return
          if (!showGrains) { el.setAttribute('r', '0'); return }
          const cy = ((tAbs * 22 + seed) % 14) + TOP_Y_BOT - 0.5
          const cx = 20 + Math.sin(tAbs * 3 + seed) * 0.35
          el.setAttribute('cx', cx.toFixed(2))
          el.setAttribute('cy', cy.toFixed(2))
          el.setAttribute('r', r.toFixed(2))
        }
        setG(grain1, 0,   0.42)
        setG(grain2, 4.7, 0.34)
        setG(grain3, 9.2, 0.5)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cycleSec, paused, twistMs, introFillSec])

  const width = Math.round(size * (VB_W / VB_H))

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={width}
      height={size}
      className={className}
      style={{ display: 'inline-block', color: 'currentColor', overflow: 'visible' }}
      aria-label="pirte"
    >
      <defs>
        <clipPath id="hg-top">
          <path d={`M${GLASS_L} ${TOP_Y_TOP} L${GLASS_R} ${TOP_Y_TOP} L${(19 + NECK_HALF)} ${TOP_Y_BOT} L${(19 - NECK_HALF)} ${TOP_Y_BOT} Z`} />
        </clipPath>
        <clipPath id="hg-bot">
          <path d={`M${(19 - NECK_HALF)} ${BOT_Y_TOP} L${(19 + NECK_HALF)} ${BOT_Y_TOP} L${GLASS_R} ${BOT_Y_BOT} L${GLASS_L} ${BOT_Y_BOT} Z`} />
        </clipPath>
      </defs>
      <g ref={rotorRef}>
        <rect x={3} y={2}    width={34} height={1.6} rx={0.8} fill="currentColor" />
        <rect x={3} y={56.4} width={34} height={1.6} rx={0.8} fill="currentColor" />
        <path
          d={`M${GLASS_L} ${TOP_Y_TOP} L${GLASS_R} ${TOP_Y_TOP} L${(19 + NECK_HALF)} ${TOP_Y_BOT} L${(19 + NECK_HALF)} ${BOT_Y_TOP} L${GLASS_R} ${BOT_Y_BOT} L${GLASS_L} ${BOT_Y_BOT} L${(19 - NECK_HALF)} ${BOT_Y_TOP} L${(19 - NECK_HALF)} ${TOP_Y_BOT} Z`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.1}
          strokeLinejoin="round"
          opacity={0.55}
        />
        <g clipPath="url(#hg-top)">
          <path ref={topRef} fill="currentColor" />
        </g>
        <g clipPath="url(#hg-bot)">
          <path ref={botRef} fill="currentColor" />
        </g>
        <circle ref={grain1} fill="currentColor" />
        <circle ref={grain2} fill="currentColor" />
        <circle ref={grain3} fill="currentColor" />
      </g>
    </svg>
  )
}
