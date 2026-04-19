import type { Scene } from './scene'

// Andy Sloane's classic rotating torus — adapted for arbitrary grid size.
export function createDonut(): Scene {
  let cols = 0, rows = 0
  const LUM = '.,-~:;=!*#$@'

  const reset = (c: number, r: number) => { cols = c; rows = r }

  const frame = (t: number) => {
    const A = t * 0.0007
    const B = t * 0.0003
    const output: string[] = Array(rows * cols).fill(' ')
    const zbuf: number[] = Array(rows * cols).fill(0)
    const cosA = Math.cos(A), sinA = Math.sin(A)
    const cosB = Math.cos(B), sinB = Math.sin(B)
    const K1 = cols * 0.6
    const K2 = 5

    for (let theta = 0; theta < 6.28; theta += 0.07) {
      const cosT = Math.cos(theta), sinT = Math.sin(theta)
      for (let phi = 0; phi < 6.28; phi += 0.02) {
        const cosP = Math.cos(phi), sinP = Math.sin(phi)
        const circleX = 2 + cosT
        const circleY = sinT
        const x = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB
        const y = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB
        const z = K2 + cosA * circleX * sinP + circleY * sinA
        const ooz = 1 / z
        const xp = Math.floor(cols / 2 + K1 * ooz * x)
        const yp = Math.floor(rows / 2 - (K1 * 0.5) * ooz * y)
        const L = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT + cosB * (cosA * sinT - cosT * sinA * sinP)
        if (L > 0 && xp >= 0 && xp < cols && yp >= 0 && yp < rows) {
          const idx = xp + cols * yp
          if (ooz > zbuf[idx]) {
            zbuf[idx] = ooz
            output[idx] = LUM[Math.floor(L * 8)] ?? '@'
          }
        }
      }
    }
    const lines: string[] = []
    for (let y = 0; y < rows; y++) lines.push(output.slice(y * cols, (y + 1) * cols).join(''))
    return lines.join('\n')
  }

  return { name: 'donut', reset, frame }
}
