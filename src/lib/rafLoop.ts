// visibility-aware long-running-work helpers shared across the app.
//
// the contract for every helper here:
//   (1) work pauses when `document.hidden` is true
//   (2) work resumes cleanly on visibility change (no time-warp, no backlog)
//   (3) the returned cancel fn disconnects both the work and the
//       visibilitychange listener — one call, full teardown
//
// there are three helpers:
//   - rafLoop      : per-frame tick with dt (for simulations / render loops)
//   - intervalLoop : timer tick (for 10-100ms cadence things like markers,
//                    spinners, url sync) that should also stop on hide
//   - whileVisible : generic enter/leave gate — runs `start` on visible,
//                    runs the returned cleanup on hide or unmount.
//                    useful for audio streams, SSE, websockets.
//
// signature: rafLoop's tick receives (t: performance.now timestamp, dt:
// seconds since previous frame, clamped to 0.1s so pauses don't cause
// physics explosions).

export type RafTick = (t: number, dt: number) => void

export function rafLoop(tick: RafTick): () => void {
  let raf = 0
  let last = performance.now()
  let running = !document.hidden
  let errored = false

  const frame = (t: number) => {
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000))
    last = t
    try {
      tick(t, dt)
    } catch (e) {
      errored = true
      running = false
      // single log so a per-frame throw doesn't flood the console
      console.error('rafLoop: tick threw, stopping loop', e)
      return
    }
    if (running) raf = requestAnimationFrame(frame)
  }

  const onVis = () => {
    if (errored) return
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

// periodic timer that auto-stops when the tab is hidden and restarts on show.
// preferred over bare setInterval for anything firing between ~10ms and ~10s
// (markers, url-sync debounces, background polling) — the background-tab cost
// of a plain setInterval is real on chrome mobile + laptops on battery.
export function intervalLoop(tick: () => void, ms: number): () => void {
  let id: ReturnType<typeof setInterval> | 0 = 0
  let errored = false

  const start = () => {
    if (id || errored) return
    id = setInterval(() => {
      try { tick() } catch (e) {
        errored = true
        stop()
        console.error('intervalLoop: tick threw, stopping', e)
      }
    }, ms)
  }
  const stop = () => {
    if (id) { clearInterval(id); id = 0 }
  }

  const onVis = () => {
    if (errored) return
    if (document.hidden) stop()
    else start()
  }

  document.addEventListener('visibilitychange', onVis)
  if (!document.hidden) start()

  return () => {
    document.removeEventListener('visibilitychange', onVis)
    stop()
  }
}

// generic enter/leave gate tied to tab visibility + component lifetime.
// `enter` is called on mount (if visible) and again on each show; it returns
// an optional cleanup that fires on hide AND on the final unmount. use this
// for resources that should not run while the tab is backgrounded — SSE
// streams, audio playback, websockets, mediastreams.
export function whileVisible(enter: () => (() => void) | void): () => void {
  let leave: (() => void) | void

  const doEnter = () => {
    if (leave) return
    try { leave = enter() } catch (e) {
      console.error('whileVisible: enter threw', e)
    }
  }
  const doLeave = () => {
    if (!leave) return
    try { leave() } catch (e) {
      console.error('whileVisible: leave threw', e)
    }
    leave = undefined
  }

  const onVis = () => {
    if (document.hidden) doLeave()
    else doEnter()
  }

  document.addEventListener('visibilitychange', onVis)
  if (!document.hidden) doEnter()

  return () => {
    document.removeEventListener('visibilitychange', onVis)
    doLeave()
  }
}
