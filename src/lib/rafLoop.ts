// single pattern for long-running raf loops across the app.
// - pauses when the tab is backgrounded (document.hidden) so cpu/allocations
//   don't accumulate while the user is elsewhere
// - resumes on visibilitychange with a fresh time origin so dt doesn't spike
// - returns a single cancel fn that tears down raf + listener
//
// signature: tick receives (t: performance.now timestamp, dt: seconds since
// previous frame, clamped to 0.1s so pauses don't cause physics explosions).

export type RafTick = (t: number, dt: number) => void

export function rafLoop(tick: RafTick): () => void {
  let raf = 0
  let last = performance.now()
  let running = !document.hidden

  const frame = (t: number) => {
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000))
    last = t
    tick(t, dt)
    if (running) raf = requestAnimationFrame(frame)
  }

  const onVis = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      running = false
    } else if (!running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  document.addEventListener('visibilitychange', onVis)
  if (running) raf = requestAnimationFrame(frame)

  return () => {
    document.removeEventListener('visibilitychange', onVis)
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    running = false
  }
}
