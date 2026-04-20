import { noise2 } from '../lib/perlin'
import type { BgProgram } from './program'

// three-layer wallpaper, tuned to feel zoomed-out into actual deep
// space: mostly black + thousands of tiny stars in real stellar colors,
// with only thin cool nebula wisps (no full-screen purple haze) and
// the occasional bright comet.

type Star = {
  x: number
  y: number
  depth: number   // 0 far, 1 near
  size: number
  phase: number
  twinkleRate: number
  r: number; g: number; b: number
  hasHalo: boolean
}

type Streak = {
  x: number; y: number
  vx: number; vy: number
  age: number
  life: number
  warm: boolean
}

// 3-octave fbm
function fbm(x: number, y: number): number {
  let v = 0, a = 0.5, fx = x, fy = y
  for (let i = 0; i < 3; i++) {
    v += a * noise2(fx, fy)
    fx *= 2; fy *= 2; a *= 0.5
  }
  return v
}

// stellar color classes — weighted by real-sky distribution, not fiction
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
  if (r < 0.72) return 0.30 + Math.random() * 0.55  // tiny pinpricks
  if (r < 0.92) return 0.85 + Math.random() * 0.80  // small
  if (r < 0.985) return 1.60 + Math.random() * 1.10 // medium
  return 2.60 + Math.random() * 1.20                // rare bright
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

  return {
    name: 'cosmos',
    reset(cols, rows, cell) {
      viewW = cols * cell
      viewH = rows * cell
      NEB_SCALE = viewW * viewH > 3_000_000 ? 12 : 8
      nw = Math.max(8, Math.floor(viewW / NEB_SCALE))
      nh = Math.max(8, Math.floor(viewH / NEB_SCALE))
      nebOff = document.createElement('canvas')
      nebOff.width = nw
      nebOff.height = nh
      nebCtx = nebOff.getContext('2d', { alpha: true })
      if (nebCtx) nebImg = nebCtx.createImageData(nw, nh)

      // ~1 star per 1400 px² — 1080p gets ~1480, 4k gets ~4000 (capped)
      const target = Math.floor(
        Math.max(900, Math.min(4000, (viewW * viewH) / 1400))
      )
      stars = []
      for (let i = 0; i < target; i++) {
        const depth = Math.pow(Math.random(), 1.8)
        const size = starSize()
        const color = starColor()
        stars.push({
          x: Math.random() * viewW,
          y: Math.random() * viewH,
          depth,
          size,
          phase: Math.random() * Math.PI * 2,
          twinkleRate: 0.4 + Math.random() * 1.6,
          r: color.r, g: color.g, b: color.b,
          hasHalo: size > 1.9 || Math.random() < 0.015,
        })
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
      // 1. NEBULA — thresholded so most of the sky is actual black.
      //    no purple. cold-blue → teal → rare gold knots (HII regions).
      // ───────────────────────────────────────────────────────────
      const data = nebImg.data
      const cxPx = cursor.x / NEB_SCALE
      const cyPx = cursor.y / NEB_SCALE
      const cursorRad = 180 / NEB_SCALE
      const cursorRad2 = cursorRad * cursorRad

      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          // higher frequency = more features per area = more "zoomed out"
          const nx = x * 0.028
          const ny = y * 0.028

          let wx = 0, wy = 0
          if (cursor.active) {
            const dx = x - cxPx, dy = y - cyPx
            const d2 = dx * dx + dy * dy
            if (d2 < cursorRad2) {
              const d = Math.sqrt(d2) || 1
              const f = 1 - d / cursorRad
              wx += (dx / d) * f * 0.9
              wy += (dy / d) * f * 0.9
            }
          }
          for (let ri = 0; ri < ripples.length; ri++) {
            const rip = ripples[ri]
            const dx = x - rip.x / NEB_SCALE
            const dy = y - rip.y / NEB_SCALE
            const d = Math.hypot(dx, dy)
            const ringR = (rip.age * 280) / NEB_SCALE
            const ringW = 32 / NEB_SCALE
            const delta = Math.abs(d - ringR)
            if (delta < ringW) {
              const amp = (1 - delta / ringW) * Math.max(0, 1 - rip.age / 0.8)
              const dir = d > 0.001 ? 1 / d : 0
              wx += dx * dir * amp * 1.1
              wy += dy * dir * amp * 1.1
            }
          }

          // single-warp domain warping
          const qx = fbm(nx + time,             ny + time * 0.6)
          const qy = fbm(nx + time * 0.8 + 5.2, ny + time * 0.9 + 1.3)
          const v  = fbm(nx + 4 * qx + wx,      ny + 4 * qy + wy)

          const mix = v * 0.9 + 0.5
          const idx = (y * nw + x) * 4

          // hard cutoff — below this there is no nebula, just space
          if (mix < 0.48) {
            data[idx + 3] = 0
            continue
          }

          // normalize within the visible band (0.48..1.0)
          const cm = Math.min(1, (mix - 0.48) / 0.52)

          // palette: cold navy → teal → rare warm gold (HII region) at peak
          let R: number, G: number, B: number
          if (cm < 0.55) {
            const u = cm / 0.55
            // navy (0.03, 0.06, 0.18) → teal (0.08, 0.28, 0.38)
            R = 0.03 + u * (0.08 - 0.03)
            G = 0.06 + u * (0.28 - 0.06)
            B = 0.18 + u * (0.38 - 0.18)
          } else if (cm < 0.85) {
            const u = (cm - 0.55) / 0.30
            // teal → cyan-white (0.30, 0.55, 0.62)
            R = 0.08 + u * (0.30 - 0.08)
            G = 0.28 + u * (0.55 - 0.28)
            B = 0.38 + u * (0.62 - 0.38)
          } else {
            const u = (cm - 0.85) / 0.15
            // cyan-white → warm amber knot (0.75, 0.55, 0.30)
            R = 0.30 + u * (0.75 - 0.30)
            G = 0.55 + u * (0.55 - 0.55)
            B = 0.62 + u * (0.30 - 0.62)
          }

          // alpha ramps gently — nebula stays a whisper, never a wall
          const alpha = 14 + cm * 28  // max ~42 ≈ 0.165 at peak, 0.055 at edge

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
      // 2. STARS — thousands of tiny points in real stellar colors.
      // ───────────────────────────────────────────────────────────
      const maxParallax = Math.min(viewW, viewH) * 0.035  // subtle, zoomed-out
      const twinkleBase = t * 0.001

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const pMag = (0.2 + s.depth * 0.9) * maxParallax
        let px = s.x - pX * pMag
        let py = s.y - pY * pMag
        px = ((px % viewW) + viewW) % viewW
        py = ((py % viewH) + viewH) % viewH

        const tw =
          0.55 +
          0.45 *
            Math.sin(twinkleBase * s.twinkleRate + s.phase) *
            (0.55 + 0.45 * noise2(s.phase + twinkleBase * 0.4, s.depth * 7))
        const core = 0.55 + 0.45 * tw * (0.55 + s.depth * 0.45)

        ctx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${core.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(px, py, s.size, 0, Math.PI * 2)
        ctx.fill()

        // only the rare bright stars get halos (~2% of field) — keeps
        // the sky crisp instead of a soft smear
        if (s.hasHalo) {
          const hr = s.size * 8
          const grd = ctx.createRadialGradient(px, py, 0, px, py, hr)
          grd.addColorStop(0, `rgba(${s.r}, ${s.g}, ${s.b}, ${(core * 0.4).toFixed(3)})`)
          grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(px, py, hr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // cursor-region bloom: nearby stars warm up briefly
      if (cursor.active) {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i]
          const pMag = (0.2 + s.depth * 0.9) * maxParallax
          const px = ((((s.x - pX * pMag) % viewW) + viewW) % viewW)
          const py = ((((s.y - pY * pMag) % viewH) + viewH) % viewH)
          const dx = px - cursor.x
          const dy = py - cursor.y
          const d2 = dx * dx + dy * dy
          if (d2 > 140 * 140) continue
          const d = Math.sqrt(d2)
          const f = 1 - d / 140
          const hr = s.size * 10 * (1 + f * 1.2)
          const grd = ctx.createRadialGradient(px, py, 0, px, py, hr)
          grd.addColorStop(0, `rgba(255, 240, 220, ${(f * 0.45).toFixed(3)})`)
          grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(px, py, hr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ───────────────────────────────────────────────────────────
      // 3. STREAKS — thin bright comets, slightly more frequent
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
        nextStreakAt = elapsed + 3.5 + Math.random() * 6
      }

      for (let i = streaks.length - 1; i >= 0; i--) {
        const st = streaks[i]
        st.age += dt
        st.x += st.vx * dt
        st.y += st.vy * dt
        if (st.age > st.life) { streaks.splice(i, 1); continue }
        const speed = Math.hypot(st.vx, st.vy) || 1
        const tailLen = 200
        const tx = st.x - (st.vx / speed) * tailLen
        const ty = st.y - (st.vy / speed) * tailLen
        const fadeIn  = Math.min(1, st.age / 0.3)
        const fadeOut = Math.max(0, 1 - (st.age - st.life + 0.5) / 0.5)
        const fade = fadeIn * fadeOut
        const rr = st.warm ? 255 : 220
        const gg = st.warm ? 225 : 235
        const bb = st.warm ? 205 : 255
        const grd = ctx.createLinearGradient(st.x, st.y, tx, ty)
        grd.addColorStop(0,   `rgba(${rr}, ${gg}, ${bb}, ${(0.9 * fade).toFixed(3)})`)
        grd.addColorStop(0.4, `rgba(${rr}, ${gg}, ${bb}, ${(0.3 * fade).toFixed(3)})`)
        grd.addColorStop(1,   'rgba(0, 0, 0, 0)')
        ctx.strokeStyle = grd
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.moveTo(st.x, st.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.fillStyle = `rgba(255, 250, 240, ${(0.95 * fade).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(st.x, st.y, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}
