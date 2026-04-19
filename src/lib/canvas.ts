export function fitCanvas(canvas: HTMLCanvasElement, ctx?: CanvasRenderingContext2D | null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  return { dpr, width: rect.width, height: rect.height }
}

export function observeResize(canvas: HTMLCanvasElement, onResize: () => void) {
  const ro = new ResizeObserver(onResize)
  ro.observe(canvas)
  return () => ro.disconnect()
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
