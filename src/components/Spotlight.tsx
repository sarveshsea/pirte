import { useEffect } from 'react'

// tracks cursor → css vars on <html> so body::before radial gradient follows
export default function Spotlight() {
  useEffect(() => {
    let tx = -1000, ty = -1000
    let raf = 0
    const onMove = (e: PointerEvent | MouseEvent) => { tx = e.clientX; ty = e.clientY }
    const tick = () => {
      document.documentElement.style.setProperty('--mx', `${tx}px`)
      document.documentElement.style.setProperty('--my', `${ty}px`)
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return null
}
