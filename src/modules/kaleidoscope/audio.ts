// lazy audio context + three voices: tinkle (mirror hit), tick (shard-shard),
// drone (ambient pad keyed to symmetry + kinetic energy).

let ctx: AudioContext | null = null
let enabled = false

// drone nodes — created the first time setSound(true) runs.
let droneOsc: OscillatorNode | null = null
let droneGain: GainNode | null = null
let droneLP: BiquadFilterNode | null = null

let lastTickAt = 0

function ensureCtx(): AudioContext | null {
  if (!ctx) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
    } catch { ctx = null }
  }
  return ctx
}

export function setSound(on: boolean) {
  enabled = on
  if (on) {
    const c = ensureCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => {})
    if (!droneOsc) {
      droneOsc = c.createOscillator()
      droneOsc.type = 'sine'
      droneOsc.frequency.value = 110
      droneGain = c.createGain()
      droneGain.gain.value = 0.0001
      droneLP = c.createBiquadFilter()
      droneLP.type = 'lowpass'
      droneLP.frequency.value = 600
      droneLP.Q.value = 0.8
      droneOsc.connect(droneLP).connect(droneGain).connect(c.destination)
      droneOsc.start()
    }
  } else {
    if (droneGain && ctx) {
      droneGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04)
    }
  }
}

export function isSoundOn(): boolean { return enabled }

// symmetry count (3..12) → low pitch. higher n = lower pitch (wider tube).
export function setDroneSymmetry(n: number) {
  if (!enabled || !ctx || !droneOsc) return
  const freq = 140 - n * 4
  droneOsc.frequency.setTargetAtTime(Math.max(55, freq), ctx.currentTime, 0.3)
}

// map total kinetic energy to drone gain, clamped.
export function setDroneEnergy(e: number) {
  if (!enabled || !ctx || !droneGain) return
  const g = Math.min(0.055, e * 2e-6)
  droneGain.gain.setTargetAtTime(Math.max(0.0001, g), ctx.currentTime, 0.08)
}

// glass tinkle on mirror/outer wall hit. size -> pitch (smaller = higher).
export function tinkle(size: number) {
  if (!enabled || !ctx) return
  const c = ctx
  if (c.state === 'suspended') c.resume().catch(() => {})
  const now = c.currentTime
  // map size 8..22 → 1400..620 Hz roughly
  const base = 620 + (22 - Math.min(22, Math.max(8, size))) * 55
  // small detuning adds glassiness
  const freq = base * (1 + (Math.random() - 0.5) * 0.04)
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = freq
  // add a high partial for shimmer
  const osc2 = c.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = freq * 3.01
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.08, now + 0.003)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
  const g2 = c.createGain()
  g2.gain.setValueAtTime(0.0001, now)
  g2.gain.exponentialRampToValueAtTime(0.025, now + 0.002)
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
  osc.connect(g).connect(c.destination)
  osc2.connect(g2).connect(c.destination)
  osc.start(now); osc2.start(now)
  osc.stop(now + 0.24); osc2.stop(now + 0.18)
}

// softer wooden tick for shard-shard; rate-limited to avoid stuttering during pileups.
export function tick(size: number) {
  if (!enabled || !ctx) return
  const c = ctx
  const now = c.currentTime
  if (now - lastTickAt < 0.06) return
  lastTickAt = now
  const freq = 240 + (30 - size) * 12
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = Math.max(120, freq)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.03, now + 0.002)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
  osc.connect(g).connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.1)
}
