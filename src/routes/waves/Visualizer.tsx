import { useEffect, useRef } from 'react'
import { rafLoop } from '../../lib/rafLoop'
import { useStudio } from './StudioContext'

const W = 560
const SCOPE_H = 140
const SPEC_H = 70

export default function Visualizer() {
  const s = useStudio()
  const scopeRef = useRef<HTMLCanvasElement>(null)
  const specRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!s.ready) return
    const scope = scopeRef.current
    const spec = specRef.current
    if (!scope || !spec) return
    const sctx = scope.getContext('2d')!
    const spctx = spec.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    for (const c of [scope, spec]) {
      c.width = W * dpr
      c.height = (c === scope ? SCOPE_H : SPEC_H) * dpr
      c.style.width = `${W}px`
      c.style.height = `${c === scope ? SCOPE_H : SPEC_H}px`
    }
    sctx.scale(dpr, dpr)
    spctx.scale(dpr, dpr)

    const timeBuf = new Uint8Array(2048)
    const freqBuf = new Uint8Array(1024)

    return rafLoop(() => {
      // scope
      s.readTimeDomain(timeBuf)
      sctx.fillStyle = 'rgba(10,10,10,0.45)'
      sctx.fillRect(0, 0, W, SCOPE_H)
      sctx.strokeStyle = '#50ffd8'
      sctx.lineWidth = 1.25
      sctx.beginPath()
      for (let x = 0; x < W; x++) {
        const i = Math.floor((x / W) * timeBuf.length)
        const v = (timeBuf[i] - 128) / 128
        const y = SCOPE_H / 2 - v * (SCOPE_H / 2 - 4)
        if (x === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y)
      }
      sctx.stroke()
      // centre line
      sctx.strokeStyle = 'rgba(255,255,255,0.06)'
      sctx.beginPath()
      sctx.moveTo(0, SCOPE_H / 2); sctx.lineTo(W, SCOPE_H / 2)
      sctx.stroke()

      // spectrum
      s.readFrequency(freqBuf)
      spctx.fillStyle = '#0a0a0a'
      spctx.fillRect(0, 0, W, SPEC_H)
      const bars = 96
      const bw = W / bars
      for (let b = 0; b < bars; b++) {
        const t = b / bars
        const i = Math.floor(Math.pow(t, 1.8) * (freqBuf.length / 3))
        const v = freqBuf[i] / 255
        const h = v * SPEC_H
        const hue = 170 + t * 60
        spctx.fillStyle = `hsl(${hue.toFixed(0)}deg 80% ${30 + v * 40}%)`
        spctx.fillRect(b * bw, SPEC_H - h, bw - 1, h)
      }
    })
  }, [s.ready, s])

  return (
    <div className="flex flex-col gap-2 p-2">
      <canvas ref={scopeRef} className="block rounded-[3px] border border-[var(--color-line)]" />
      <canvas ref={specRef}  className="block rounded-[3px] border border-[var(--color-line)]" />
    </div>
  )
}
