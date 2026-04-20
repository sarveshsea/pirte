import { useEffect } from 'react'
import { rafLoop } from '../lib/rafLoop'

// tracks cursor → css vars on <html> so body::before radial gradient follows
export default function Spotlight() {
  useEffect(() => {
    let tx = -1000, ty = -1000
    const onMove = (e: PointerEvent | MouseEvent) => { tx = e.clientX; ty = e.clientY }
    window.addEventListener('pointermove', onMove)
    const stop = rafLoop(() => {
      document.documentElement.style.setProperty('--mx', `${tx}px`)
      document.documentElement.style.setProperty('--my', `${ty}px`)
    })
    return () => {
      window.removeEventListener('pointermove', onMove)
      stop()
    }
  }, [])
  return null
}
