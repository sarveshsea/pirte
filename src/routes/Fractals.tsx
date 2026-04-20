import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import Tile from '../components/Tile'

type Mode = 'mandelbrot' | 'julia'

function parsePair(s: string | null): [number, number] | null {
  if (!s) return null
  const [a, b] = s.split(',').map((v) => parseFloat(v))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [a, b]
}

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform int uMode; // 0 mandelbrot, 1 julia
uniform vec2 uJuliaC;
uniform float uIterScale;
uniform float uTime;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 p = uCenter + uv * uScale;
  vec2 z = (uMode == 1) ? p : vec2(0.0);
  vec2 c = (uMode == 1) ? uJuliaC : p;
  float maxIter = 240.0 * uIterScale;
  float i = 0.0;
  for (float k = 0.0; k < 1200.0; k++) {
    if (k >= maxIter) break;
    float zx = z.x * z.x - z.y * z.y + c.x;
    float zy = 2.0 * z.x * z.y + c.y;
    z = vec2(zx, zy);
    if (dot(z, z) > 256.0) { i = k; break; }
    i = k;
  }
  float smooth_i = i - log2(log2(max(dot(z, z), 2.0))) + 4.0;
  if (i >= maxIter - 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float m = pow(smooth_i / maxIter, 0.55);
  float hue = fract(smooth_i * 0.018 + uTime * 0.04 + 0.62);
  vec3 col = hsv2rgb(vec3(hue, 0.55, m));
  gl_FragColor = vec4(col, 1.0);
}
`

const VERT = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const DEFAULT_CENTER = { mandelbrot: [-0.5, 0] as [number, number], julia: [0, 0] as [number, number] }
const DEFAULT_SCALE = 3
const DEFAULT_JULIA_C: [number, number] = [-0.8, 0.156]

export default function Fractals() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const initialMode: Mode = params.get('m') === 'julia' ? 'julia' : 'mandelbrot'
  const initialCenter = parsePair(params.get('c')) ?? [...DEFAULT_CENTER[initialMode]] as [number, number]
  const initialScale = (() => {
    const v = parseFloat(params.get('z') ?? '')
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_SCALE
  })()
  const initialJuliaC = parsePair(params.get('jc')) ?? DEFAULT_JULIA_C
  const [mode, setMode] = useState<Mode>(initialMode)
  const [info, setInfo] = useState({ x: initialCenter[0], y: initialCenter[1], scale: initialScale })
  const modeRef = useRef(mode)
  modeRef.current = mode
  const juliaCRef = useRef<[number, number]>(initialJuliaC)

  // debounced URL writer — fires once per settle point, not per frame
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => {
        p.set('m', mode)
        p.set('c', `${info.x.toFixed(5)},${info.y.toFixed(5)}`)
        p.set('z', info.scale.toFixed(5))
        if (mode === 'julia') p.set('jc', `${juliaCRef.current[0].toFixed(4)},${juliaCRef.current[1].toFixed(4)}`)
        else p.delete('jc')
        return p
      }, { replace: true })
    }, 500)
    return () => clearTimeout(t)
  }, [mode, info.x, info.y, info.scale, setParams])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: false })
    const gl = renderer.gl
    gl.canvas.style.width = '100%'
    gl.canvas.style.height = '100%'
    gl.canvas.style.display = 'block'
    wrap.appendChild(gl.canvas)

    const geom = new Triangle(gl)
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uRes: { value: [1, 1] },
        uCenter: { value: [...initialCenter] },
        uScale: { value: initialScale },
        uMode: { value: initialMode === 'julia' ? 1 : 0 },
        uJuliaC: { value: [...initialJuliaC] },
        uIterScale: { value: 1 },
        uTime: { value: 0 },
      },
    })
    const mesh = new Mesh(gl, { geometry: geom, program })

    const state = {
      center: [...initialCenter] as [number, number],
      scale: initialScale,
      juliaC: [...initialJuliaC] as [number, number],
      mode: initialMode === 'julia' ? 1 : 0,
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      renderer.setSize(rect.width, rect.height)
      program.uniforms.uRes.value = [gl.canvas.width, gl.canvas.height]
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const render = () => {
      program.uniforms.uCenter.value = state.center
      program.uniforms.uScale.value = state.scale
      program.uniforms.uMode.value = state.mode
      program.uniforms.uJuliaC.value = state.juliaC
      program.uniforms.uTime.value = performance.now() * 0.001
      renderer.render({ scene: mesh })
      setInfo({ x: state.center[0], y: state.center[1], scale: state.scale })
    }
    let animRaf = 0
    const animate = () => {
      render()
      animRaf = requestAnimationFrame(animate)
    }
    animate()

    const screenToWorld = (px: number, py: number): [number, number] => {
      const rect = wrap.getBoundingClientRect()
      const nx = (px - rect.left - rect.width / 2) / Math.min(rect.width, rect.height)
      const ny = (rect.height / 2 - (py - rect.top)) / Math.min(rect.width, rect.height)
      return [state.center[0] + nx * state.scale, state.center[1] + ny * state.scale]
    }

    let dragging = false
    let lastX = 0, lastY = 0
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX; lastY = e.clientY
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      if (dragging) {
        const dx = (e.clientX - lastX) / Math.min(rect.width, rect.height)
        const dy = (e.clientY - lastY) / Math.min(rect.width, rect.height)
        state.center[0] -= dx * state.scale
        state.center[1] += dy * state.scale
        lastX = e.clientX; lastY = e.clientY
      }
      if (modeRef.current === 'julia' && !dragging) {
        // julia c tracks cursor in viewport normalized space for live interaction
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        state.juliaC = [(nx - 0.5) * 2 * 1.3, (0.5 - ny) * 2 * 1.3]
        juliaCRef.current = state.juliaC
      }
      render()
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.pow(1.0015, e.deltaY)
      const [wx, wy] = screenToWorld(e.clientX, e.clientY)
      state.center[0] = wx + (state.center[0] - wx) * factor
      state.center[1] = wy + (state.center[1] - wy) * factor
      state.scale *= factor
      render()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key.toLowerCase() === 'm') { state.mode = 0; modeRef.current = 'mandelbrot'; setMode('mandelbrot'); state.center = [...DEFAULT_CENTER.mandelbrot]; state.scale = DEFAULT_SCALE; render() }
      if (e.key.toLowerCase() === 'j') { state.mode = 1; modeRef.current = 'julia'; setMode('julia'); state.center = [...DEFAULT_CENTER.julia]; state.scale = DEFAULT_SCALE; render() }
      if (e.key.toLowerCase() === 'r') {
        state.center = [...(state.mode === 0 ? DEFAULT_CENTER.mandelbrot : DEFAULT_CENTER.julia)]
        state.scale = DEFAULT_SCALE
        render()
      }
    }

    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)
    wrap.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      if (animRaf) cancelAnimationFrame(animRaf)
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      gl.canvas.remove()
    }
  }, [])

  return (
    <Tile
      label={`fractals · ${mode}`}
      code="01"
      footer={
        <div className="flex items-center justify-between">
          <span>m mandelbrot · j julia · r reset · drag pan · wheel zoom</span>
          <span className="tabular-nums">
            c ({info.x.toFixed(4)}, {info.y.toFixed(4)}) · z ×{(DEFAULT_SCALE / info.scale).toFixed(2)}
          </span>
        </div>
      }
    >
      <div ref={wrapRef} className="h-[72vh] w-full" />
    </Tile>
  )
}
