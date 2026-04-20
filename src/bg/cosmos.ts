import { noise2 } from '../lib/perlin'
import type { BgProgram } from './program'

// three-layer wallpaper: nebula (warped color field, offscreen) →
// stars (crisp points + halos at full dpr, parallax with cursor) →
// streaks (rare light comets crossing the canvas).

type Star = {
  x: number
  y: number
  depth: number   // 0 far, 1 near — bigger + more parallax at higher depth
  phase: number
  hue: number
}

type Streak = {
  x: number; y: number
  vx: number; vy: number
  age: number
  life: number
  hue: number
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

export function createCosmos(): BgProgram {
  let viewW = 0, viewH = 0
  let nw = 0, nh = 0
  let NEB_SCALE = 8
  let nebOff: HTMLCanvasElement | null = null
  let nebCtx: CanvasRenderingContext2D | null = null
  let nebImg: ImageData | null = null
  let stars: Star[] = []
  const streaks: Streak[] = []
  let nextStreakAt = 4
  let elapsed = 0
  // smoothed parallax — (cursor/viewport - 0.5), [-0.5, 0.5]
  let pX = 0, pY = 0

  return {
    name: 'cosmos',
    reset(cols, rows, cell) {
      viewW = cols * cell
      viewH = rows * cell
      // scale the offscreen nebula so 4k stays responsive
      NEB_SCALE = viewW * viewH > 3_000_000 ? 12 : 8
      nw = Math.max(8, Math.floor(viewW / NEB_SCALE))
      nh = Math.max(8, Math.floor(viewH / NEB_SCALE))
      nebOff = document.createElement('canvas')
      nebOff.width = nw
      nebOff.height = nh
      nebCtx = nebOff.getContext('2d', { alpha: true })
      if (nebCtx) nebImg = nebCtx.createImageData(nw, nh)

      // star density scales with area, capped to stay cheap on huge displays
      const target = Math.floor(Math.max(220, Math.min(520, (viewW * viewH) / 5400)))
      stars = []
      for (let i = 0; i < target; i++) {
        stars.push({
          x: Math.random() * viewW,
          y: Math.random() * viewH,
          depth: Math.pow(Math.random(), 1.6),
          phase: Math.random() * Math.PI * 2,
          hue: Math.random(),
        })
      }
      streaks.length = 0
      nextStreakAt = 4 + Math.random() * 4
      elapsed = 0
    },
    frame(ctx, t, dt, cursor, ripples) {
      if (!nebOff || !nebCtx || !nebImg) return
      elapsed += dt
      const time = t * 0.00006

      const targetPX = cursor.active ? ((cursor.x / viewW) - 0.5) : 0
      const targetPY = cursor.active ? ((cursor.y / viewH) - 0.5) : 0
      const k = Math.min(1, dt * 4)
      pX += (targetPX - pX) * k
      pY += (targetPY - pY) * k

      // ───────────────────────────────────────────────────────────
      // 1. NEBULA — domain-warped fbm, 4-stop cosmic palette
      // ───────────────────────────────────────────────────────────
      const data = nebImg.data
      const cxPx = cursor.x / NEB_SCALE
      const cyPx = cursor.y / NEB_SCALE
      const cursorRad = 240 / NEB_SCALE
      const cursorRad2 = cursorRad * cursorRad

      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const nx = x * 0.016
          const ny = y * 0.016

          let wx = 0, wy = 0
          if (cursor.active) {
            const dx = x - cxPx, dy = y - cyPx
            const d2 = dx * dx + dy * dy
            if (d2 < cursorRad2) {
              const d = Math.sqrt(d2) || 1
              const f = 1 - d / cursorRad
              wx += (dx / d) * f * 1.2
              wy += (dy / d) * f * 1.2
            }
          }
          for (let ri = 0; ri < ripples.length; ri++) {
            const rip = ripples[ri]
            const dx = x - rip.x / NEB_SCALE
            const dy = y - rip.y / NEB_SCALE
            const d = Math.hypot(dx, dy)
            const ringR = (rip.age * 300) / NEB_SCALE
            const ringW = 36 / NEB_SCALE
            const delta = Math.abs(d - ringR)
            if (delta < ringW) {
              const amp = (1 - delta / ringW) * Math.max(0, 1 - rip.age / 0.8)
              const dir = d > 0.001 ? 1 / d : 0
              wx += dx * dir * amp * 1.4
              wy += dy * dir * amp * 1.4
            }
          }

          // single-warp domain warping — 3 fbm calls per pixel
          const qx = fbm(nx + time,             ny + time * 0.6)
          const qy = fbm(nx + time * 0.8 + 5.2, ny + time * 0.9 + 1.3)
          const v  = fbm(nx + 4 * qx + wx,      ny + 4 * qy + wy)

          let mix = v * 0.9 + 0.5
          if (mix < 0) mix = 0; else if (mix > 1) mix = 1

          // 4-stop palette: deep navy → indigo → magenta → hot pink core
          let R: number, G: number, B: number
          if (mix < 0.34) {
            const u = mix / 0.34
            R = 0.05 + u * (0.24 - 0.05)
            G = 0.06 + u * (0.16 - 0.06)
            B = 0.22 + u * (0.58 - 0.22)
          } else if (mix < 0.70) {
            const u = (mix - 0.34) / 0.36
            R = 0.24 + u * (0.74 - 0.24)
            G = 0.16 + u * (0.26 - 0.16)
            B = 0.58 + u * (0.84 - 0.58)
          } else {
            const u = (mix - 0.70) / 0.30
            R = 0.74 + u * (1.00 - 0.74)
            G = 0.26 + u * (0.56 - 0.26)
            B = 0.84 + u * (0.90 - 0.84)
          }

          // bright knots where nebula is densest
          if (mix > 0.78) {
            const boost = (mix - 0.78) * 2.2
            R = Math.min(1, R + boost * 0.42)
            G = Math.min(1, G + boost * 0.22)
            B = Math.min(1, B + boost * 0.32)
          }

          const alpha = 38 + mix * 55  // ~0.15 → 0.36

          const idx = (y * nw + x) * 4
          data[idx]     = (R * 255) | 0
          data[idx + 1] = (G * 255) | 0
          data[idx + 2] = (B * 255) | 0
          data[idx + 3] = alpha | 0
        }
      }

      nebCtx.putImageData(nebImg, 0, 0)
      // wipe GridBackground's fade residue — cosmos fully repaints
      ctx.clearRect(0, 0, viewW, viewH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(nebOff, 0, 0, nw, nh, 0, 0, viewW, viewH)

      // ───────────────────────────────────────────────────────────
      // 2. STARS — crisp at full dpr, depth-tiered parallax, twinkle
      // ───────────────────────────────────────────────────────────
      const maxParallax = Math.min(viewW, viewH) * 0.14
      const twinkleBase = t * 0.0019

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const pMag = (0.28 + s.depth * 0.95) * maxParallax
        let px = s.x - pX * pMag
        let py = s.y - pY * pMag
        // wrap so the field stays full as cursor moves
        px = ((px % viewW) + viewW) % viewW
        py = ((py % viewH) + viewH) % viewH

        const tw =
          0.5 + 0.5 * Math.sin(twinkleBase + s.phase) *
          (0.55 + 0.45 * noise2(s.phase + twinkleBase * 0.3, s.depth * 5))
        const size = 0.55 + s.depth * 2.4
        const core = 0.5 + 0.5 * tw * (0.55 + s.depth * 0.55)

        const rr = (210 + (1 - s.hue) * 45) | 0
        const gg = (215 + (1 - Math.abs(s.hue - 0.5)) * 35) | 0
        const bb = 245

        ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${core.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fill()

        // near stars get a soft halo
        if (s.depth > 0.55) {
          const hr = size * 6.5
          const grd = ctx.createRadialGradient(px, py, 0, px, py, hr)
          grd.addColorStop(0, `rgba(${rr}, ${gg}, ${bb}, ${(core * 0.38).toFixed(3)})`)
          grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(px, py, hr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // cursor-region bloom: nearby stars light up warmer + bigger
      if (cursor.active) {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i]
          // use parallaxed position for hit-testing so the bloom tracks what you see
          const pMag = (0.28 + s.depth * 0.95) * maxParallax
          const px = ((((s.x - pX * pMag) % viewW) + viewW) % viewW)
          const py = ((((s.y - pY * pMag) % viewH) + viewH) % viewH)
          const dx = px - cursor.x
          const dy = py - cursor.y
          const d = Math.hypot(dx, dy)
          if (d > 180) continue
          const f = 1 - d / 180
          const size = (0.55 + s.depth * 2.4) * (1 + f * 1.4)
          const grd = ctx.createRadialGradient(px, py, 0, px, py, size * 10)
          grd.addColorStop(0, `rgba(255, 240, 220, ${(f * 0.48).toFixed(3)})`)
          grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(px, py, size * 10, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ───────────────────────────────────────────────────────────
      // 3. STREAKS — rare bright comets crossing the canvas
      // ───────────────────────────────────────────────────────────
      if (elapsed > nextStreakAt && streaks.length < 2) {
        const edge = Math.floor(Math.random() * 4)
        const speed = 240 + Math.random() * 200
        let sx = 0, sy = 0, svx = 0, svy = 0
        if (edge === 0)      { sx = -40;        sy = Math.random() * viewH; svx = speed;  svy = (Math.random() - 0.5) * 120 }
        else if (edge === 1) { sx = viewW + 40; sy = Math.random() * viewH; svx = -speed; svy = (Math.random() - 0.5) * 120 }
        else if (edge === 2) { sx = Math.random() * viewW; sy = -40;        svx = (Math.random() - 0.5) * 120; svy = speed  }
        else                 { sx = Math.random() * viewW; sy = viewH + 40; svx = (Math.random() - 0.5) * 120; svy = -speed }
        streaks.push({
          x: sx, y: sy, vx: svx, vy: svy,
          age: 0, life: 2.2 + Math.random() * 1.8,
          hue: Math.random(),
        })
        nextStreakAt = elapsed + 6 + Math.random() * 9
      }

      for (let i = streaks.length - 1; i >= 0; i--) {
        const st = streaks[i]
        st.age += dt
        st.x += st.vx * dt
        st.y += st.vy * dt
        if (st.age > st.life) { streaks.splice(i, 1); continue }
        const speed = Math.hypot(st.vx, st.vy) || 1
        const tailLen = 180
        const tx = st.x - (st.vx / speed) * tailLen
        const ty = st.y - (st.vy / speed) * tailLen
        const fadeIn  = Math.min(1, st.age / 0.35)
        const fadeOut = Math.max(0, 1 - (st.age - st.life + 0.6) / 0.6)
        const fade = fadeIn * fadeOut
        const rr = st.hue > 0.5 ? 255 : 210
        const bb = st.hue > 0.5 ? 210 : 255
        const grd = ctx.createLinearGradient(st.x, st.y, tx, ty)
        grd.addColorStop(0,   `rgba(${rr}, 230, ${bb}, ${(0.9 * fade).toFixed(3)})`)
        grd.addColorStop(0.4, `rgba(${rr}, 230, ${bb}, ${(0.35 * fade).toFixed(3)})`)
        grd.addColorStop(1,   'rgba(0, 0, 0, 0)')
        ctx.strokeStyle = grd
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(st.x, st.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        // bright head
        ctx.fillStyle = `rgba(255, 248, 230, ${(0.95 * fade).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(st.x, st.y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}
