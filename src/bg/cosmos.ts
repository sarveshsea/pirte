import { noise2 } from '../lib/perlin'
import type { BgProgram } from './program'

// deep-space wallpaper: thousands of micro-stars clustered along a
// tilted milky-way band (density = perlin + gaussian-band bias +
// a handful of globular clusters), a whisper-thin nebula sharing
// the same band, and the occasional comet. star rendering uses
// stellar color classes + diffraction spikes on the brightest
// so they read as actual stars, not uniform dots.

type Star = {
  x: number
  y: number
  depth: number
  size: number
  phase: number
  twinkleRate: number
  r: number; g: number; b: number
  hasSpikes: boolean
}

type Streak = {
  x: number; y: number
  vx: number; vy: number
  age: number
  life: number
  warm: boolean
}

function fbm(x: number, y: number): number {
  let v = 0, a = 0.5, fx = x, fy = y
  for (let i = 0; i < 3; i++) {
    v += a * noise2(fx, fy)
    fx *= 2; fy *= 2; a *= 0.5
  }
  return v
}

function starColor(): { r: number; g: number; b: number } {
  const h = Math.random()
  if (h < 0.08) return { r: 170, g: 200, b: 255 }   // O/B hot blue
  if (h < 0.40) return { r: 225, g: 232, b: 255 }   // A blue-white
  if (h < 0.66) return { r: 250, g: 248, b: 242 }   // F/G white
  if (h < 0.86) return { r: 255, g: 240, b: 210 }   // G yellow
  if (h < 0.96) return { r: 255, g: 210, b: 170 }   // K orange
  return { r: 255, g: 180, b: 150 }                 // M red
}

function starSize(): number {
  const r = Math.random()
  if (r < 0.93) return 0.18 + Math.random() * 0.45  // microscopic (≤0.63px)
  if (r < 0.986) return 0.62 + Math.random() * 0.55 // small
  if (r < 0.997) return 1.18 + Math.random() * 0.65 // medium
  return 1.85 + Math.random() * 0.75                // rare bright (≤2.6px)
}

// milky-way band — rotated 8.6° from horizontal (sin 0.15)
const BAND_ANGLE = 0.15
const BAND_COS = Math.cos(BAND_ANGLE)
const BAND_SIN = Math.sin(BAND_ANGLE)

function bandDistance(x: number, y: number, viewW: number, viewH: number): number {
  // perpendicular distance from the tilted band centerline through the viewport center
  return (y - viewH / 2) * BAND_COS - (x - viewW / 2) * BAND_SIN
}

export function createCosmos(): BgProgram {
  let viewW = 0, viewH = 0
  let nw = 0, nh = 0
  let NEB_SCALE = 8
  let nebOff: HTMLCanvasElement | null = null
  let nebCtx: CanvasRenderingContext2D | null = null
  let nebImg: ImageData | null = null
  let stars: Star[] = []
  const streaks: Streak[] = []
  let nextStreakAt = 3
  let elapsed = 0
  let pX = 0, pY = 0
  let bandWidth = 1

  return {
    name: 'cosmos',
    reset(cols, rows, cell) {
      viewW = cols * cell
      viewH = rows * cell
      bandWidth = viewH * 0.22
      const isTouch = typeof matchMedia !== 'undefined'
        && matchMedia('(pointer: coarse)').matches
      // bigger cell = lower-res nebula = fewer fbm evals per frame
      NEB_SCALE = isTouch ? 16 : (viewW * viewH > 3_000_000 ? 12 : 8)
      nw = Math.max(8, Math.floor(viewW / NEB_SCALE))
      nh = Math.max(8, Math.floor(viewH / NEB_SCALE))
      nebOff = document.createElement('canvas')
      nebOff.width = nw
      nebOff.height = nh
      nebCtx = nebOff.getContext('2d', { alpha: true })
      if (nebCtx) nebImg = nebCtx.createImageData(nw, nh)

      // denser — true zoomed-out field. cut star count on touch / low-power
      // devices where a 10k+ star loop + domain-warp nebula melts battery.
      const isCoarse = typeof matchMedia !== 'undefined'
        && matchMedia('(pointer: coarse)').matches
      const densityCap = isCoarse ? 3500 : 12000
      const densityFloor = isCoarse ? 1800 : 5500
      const densityDiv = isCoarse ? 700 : 220
      const target = Math.floor(
        Math.max(densityFloor, Math.min(densityCap, (viewW * viewH) / densityDiv))
      )
      stars = []

      // ── 1. globular clusters: 4–7 tight dense groups
      const numClusters = 4 + Math.floor(Math.random() * 4)
      for (let c = 0; c < numClusters; c++) {
        const cx = Math.random() * viewW
        const cy = Math.random() * viewH
        // cluster radius + member count scale with size
        const rad = 18 + Math.random() * 38
        const n = 55 + Math.floor(Math.random() * 90)
        for (let i = 0; i < n; i++) {
          // biased-radial: r² gives center concentration
          const u = (Math.random() + Math.random() + Math.random()) / 3
          const r = u * u * rad
          const th = Math.random() * Math.PI * 2
          const x = cx + Math.cos(th) * r
          const y = cy + Math.sin(th) * r
          if (x < 0 || x > viewW || y < 0 || y > viewH) continue
          stars.push(makeStar(x, y))
        }
      }

      // ── 2. field stars via density-field rejection sampling
      const need = target - stars.length
      const densA = 0.0022  // big-scale clouds
      const densB = 0.0075  // mid-scale variation
      for (let i = 0; i < need; i++) {
        let x = 0, y = 0
        for (let attempt = 0; attempt < 7; attempt++) {
          x = Math.random() * viewW
          y = Math.random() * viewH
          const bd = bandDistance(x, y, viewW, viewH)
          const band = Math.exp(-(bd * bd) / (2 * bandWidth * bandWidth))
          const p = 0.5 + 0.5 * noise2(x * densA, y * densA) +
                    0.3 * noise2(x * densB, y * densB)
          // band boosts density strongly; perlin adds organic clumping + voids
          const density = Math.min(1, band * 0.85 + p * 0.45 + 0.12)
          if (Math.random() < density) break
        }
        stars.push(makeStar(x, y))
      }

      streaks.length = 0
      nextStreakAt = 3 + Math.random() * 4
      elapsed = 0
    },
    frame(ctx, t, dt, cursor, ripples) {
      if (!nebOff || !nebCtx || !nebImg) return
      elapsed += dt
      const time = t * 0.00005

      const targetPX = cursor.active ? ((cursor.x / viewW) - 0.5) : 0
      const targetPY = cursor.active ? ((cursor.y / viewH) - 0.5) : 0
      const k = Math.min(1, dt * 4)
      pX += (targetPX - pX) * k
      pY += (targetPY - pY) * k

      // ───────────────────────────────────────────────────────────
      // 1. NEBULA — matte dust whispers along the galactic band
      // ───────────────────────────────────────────────────────────
      const data = nebImg.data
      const cxPx = cursor.x / NEB_SCALE
      const cyPx = cursor.y / NEB_SCALE
      const cursorRad = 140 / NEB_SCALE
      const cursorRad2 = cursorRad * cursorRad
      const bandWidthNeb = bandWidth / NEB_SCALE
      const bandInv2 = 1 / (2 * bandWidthNeb * bandWidthNeb)

      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          // high-freq noise: smaller + denser features → reads far-away
          const nx = x * 0.058
          const ny = y * 0.058

          let wx = 0, wy = 0
          if (cursor.active) {
            const dx = x - cxPx, dy = y - cyPx
            const d2 = dx * dx + dy * dy
            if (d2 < cursorRad2) {
              const d = Math.sqrt(d2) || 1
              const f = 1 - d / cursorRad
              wx += (dx / d) * f * 0.8
              wy += (dy / d) * f * 0.8
            }
          }
          for (let ri = 0; ri < ripples.length; ri++) {
            const rip = ripples[ri]
            const dx = x - rip.x / NEB_SCALE
            const dy = y - rip.y / NEB_SCALE
            const d = Math.hypot(dx, dy)
            const ringR = (rip.age * 280) / NEB_SCALE
            const ringW = 30 / NEB_SCALE
            const delta = Math.abs(d - ringR)
            if (delta < ringW) {
              const amp = (1 - delta / ringW) * Math.max(0, 1 - rip.age / 0.8)
              const dir = d > 0.001 ? 1 / d : 0
              wx += dx * dir * amp * 1.0
              wy += dy * dir * amp * 1.0
            }
          }

          const qx = fbm(nx + time,             ny + time * 0.6)
          const qy = fbm(nx + time * 0.8 + 5.2, ny + time * 0.9 + 1.3)
          const v  = fbm(nx + 4 * qx + wx,      ny + 4 * qy + wy)
          const mix = v * 0.9 + 0.5

          // galactic-band factor for this offscreen pixel
          const bd = (y - nh / 2) * BAND_COS - (x - nw / 2) * BAND_SIN
          const band = Math.exp(-(bd * bd) * bandInv2)

          // higher threshold — less nebula coverage, more pure black
          const threshold = 0.64 - band * 0.10

          const idx = (y * nw + x) * 4
          if (mix < threshold) { data[idx + 3] = 0; continue }

          const cm = Math.min(1, (mix - threshold) / (1 - threshold))

          // matte palette: cool dust, cold → neutral white peak, no amber
          let R: number, G: number, B: number
          if (cm < 0.60) {
            const u = cm / 0.60
            // navy (0.02, 0.04, 0.14) → slate-blue (0.10, 0.20, 0.32)
            R = 0.02 + u * (0.10 - 0.02)
            G = 0.04 + u * (0.20 - 0.04)
            B = 0.14 + u * (0.32 - 0.14)
          } else {
            const u = (cm - 0.60) / 0.40
            // slate-blue → cool off-white (0.42, 0.48, 0.55)
            R = 0.10 + u * (0.42 - 0.10)
            G = 0.20 + u * (0.48 - 0.20)
            B = 0.32 + u * (0.55 - 0.32)
          }

          // matte alpha — barely there, peaks ~0.055, band-scaled
          const alpha = cm * 14 * (0.35 + band * 0.65)

          data[idx]     = (R * 255) | 0
          data[idx + 1] = (G * 255) | 0
          data[idx + 2] = (B * 255) | 0
          data[idx + 3] = alpha | 0
        }
      }

      nebCtx.putImageData(nebImg, 0, 0)
      ctx.clearRect(0, 0, viewW, viewH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(nebOff, 0, 0, nw, nh, 0, 0, viewW, viewH)

      // ───────────────────────────────────────────────────────────
      // 2. STARS — crisp, color-varied, with spikes on the brightest
      // ───────────────────────────────────────────────────────────
      const maxParallax = Math.min(viewW, viewH) * 0.009  // very subtle sway — distant
      const twinkleBase = t * 0.0009

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const pMag = (0.2 + s.depth * 0.9) * maxParallax
        let px = s.x - pX * pMag
        let py = s.y - pY * pMag
        px = ((px % viewW) + viewW) % viewW
        py = ((py % viewH) + viewH) % viewH

        // calmer twinkle for matte feel
        const tw =
          0.65 +
          0.35 *
            Math.sin(twinkleBase * s.twinkleRate + s.phase) *
            (0.6 + 0.4 * noise2(s.phase + twinkleBase * 0.4, s.depth * 7))
        const alpha = 0.55 + 0.45 * tw * (0.55 + s.depth * 0.45)
        const size = s.size * (0.92 + tw * 0.12)

        // core — crisp fillRect for sub-pixel pinpricks, arc for larger
        if (size < 0.9) {
          ctx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha.toFixed(3)})`
          ctx.fillRect(px - size / 2, py - size / 2, size, size)
        } else {
          ctx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(px, py, size, 0, Math.PI * 2)
          ctx.fill()
        }

        // short crisp plot-marker spikes on brightest stars — reads
        // as catalog / sky-survey crosshairs, not cinematic bloom
        if (s.hasSpikes) {
          const len = size * 3.2
          ctx.strokeStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${(alpha * 0.32).toFixed(3)})`
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(px - len, py)
          ctx.lineTo(px + len, py)
          ctx.moveTo(px, py - len)
          ctx.lineTo(px, py + len)
          ctx.stroke()
        }
      }

      // ───────────────────────────────────────────────────────────
      // 3. STREAKS — thin comets crossing the field
      // ───────────────────────────────────────────────────────────
      if (elapsed > nextStreakAt && streaks.length < 3) {
        const edge = Math.floor(Math.random() * 4)
        const speed = 260 + Math.random() * 220
        let sx = 0, sy = 0, svx = 0, svy = 0
        if (edge === 0)      { sx = -40;        sy = Math.random() * viewH; svx = speed;  svy = (Math.random() - 0.5) * 140 }
        else if (edge === 1) { sx = viewW + 40; sy = Math.random() * viewH; svx = -speed; svy = (Math.random() - 0.5) * 140 }
        else if (edge === 2) { sx = Math.random() * viewW; sy = -40;        svx = (Math.random() - 0.5) * 140; svy = speed  }
        else                 { sx = Math.random() * viewW; sy = viewH + 40; svx = (Math.random() - 0.5) * 140; svy = -speed }
        streaks.push({
          x: sx, y: sy, vx: svx, vy: svy,
          age: 0, life: 1.9 + Math.random() * 1.4,
          warm: Math.random() < 0.3,
        })
        nextStreakAt = elapsed + 4 + Math.random() * 7
      }

      for (let i = streaks.length - 1; i >= 0; i--) {
        const st = streaks[i]
        st.age += dt
        st.x += st.vx * dt
        st.y += st.vy * dt
        if (st.age > st.life) { streaks.splice(i, 1); continue }
        const speed = Math.hypot(st.vx, st.vy) || 1
        const tailLen = 140
        const tx = st.x - (st.vx / speed) * tailLen
        const ty = st.y - (st.vy / speed) * tailLen
        const fadeIn  = Math.min(1, st.age / 0.3)
        const fadeOut = Math.max(0, 1 - (st.age - st.life + 0.5) / 0.5)
        const fade = fadeIn * fadeOut
        const rr = st.warm ? 255 : 220
        const gg = st.warm ? 225 : 235
        const bb = st.warm ? 205 : 255
        const grd = ctx.createLinearGradient(st.x, st.y, tx, ty)
        grd.addColorStop(0,   `rgba(${rr}, ${gg}, ${bb}, ${(0.55 * fade).toFixed(3)})`)
        grd.addColorStop(0.4, `rgba(${rr}, ${gg}, ${bb}, ${(0.18 * fade).toFixed(3)})`)
        grd.addColorStop(1,   'rgba(0, 0, 0, 0)')
        ctx.strokeStyle = grd
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.moveTo(st.x, st.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.fillStyle = `rgba(255, 250, 240, ${(0.75 * fade).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(st.x, st.y, 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}

function makeStar(x: number, y: number): Star {
  const depth = Math.pow(Math.random(), 1.8)
  const size = starSize()
  const color = starColor()
  return {
    x, y, depth, size,
    phase: Math.random() * Math.PI * 2,
    twinkleRate: 0.4 + Math.random() * 1.6,
    r: color.r, g: color.g, b: color.b,
    hasSpikes: size > 1.85,
  }
}
