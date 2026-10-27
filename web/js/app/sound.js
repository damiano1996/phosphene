// @ts-check
const RATE = 22050

/**
 * The same little sound as the phone app while the view moves: a soft bubble tick each time a new cell becomes the centre, a little louder and higher the faster you go, and a
 * low, quiet pop when it comes to rest. Synthesised here (no audio files) and kept quiet on purpose. Browsers keep sound off until the page has been touched, so it starts at the
 * first click or key.
 */
export class Asmr {
  constructor() { this.enabled = true; this.ctx = null; this.ticks = []; this.pop = null; this.last = 0; this.n = 0
    // phones only allow sound from a finished touch (a pointer *down* does not count on iOS), and may stop it again (a call, the page in the background): so every touch tries again until it is running
    const events = ['pointerup', 'touchend', 'click', 'keydown']
    const unlock = () => { this.unlock(); if (this.ctx?.state === 'running') for (const e of events) removeEventListener(e, unlock, true) }
    for (const e of events) addEventListener(e, unlock, true) }

  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume?.(); return }
    try {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext; if (!AC) return
      this.ctx = new AC()
      // five slightly different bubbles so it never sounds like one sample on repeat, each at three speeds (pitch and loudness baked in)
      this.ticks = Array.from({ length: 5 }, (_, i) => [0, 1, 2].map(lvl => { const s = lvl / 2; return this.buffer(this.bubble((560 + 70 * i) * (0.9 + 0.35 * s), 0.045, 1.25), 0.10 + 0.22 * s) }))
      this.pop = this.buffer(this.bubble(230, 0.12, 0.8), 0.18)
      const quiet = this.ctx.createBufferSource(); quiet.buffer = this.ctx.createBuffer(1, 1, RATE); quiet.connect(this.ctx.destination); quiet.start()      // (iOS wants something played inside the touch)
      this.ctx.resume?.()
    } catch { this.ctx = null }
  }
  /** A sine that glides up a little and dies away quickly, with a soft attack so it never clicks. */
  bubble(f0, seconds, glide) {
    const len = Math.floor(seconds * RATE), out = new Float32Array(len); let phase = 0
    for (let i = 0; i < len; i++) { const t = i / len, f = f0 * (1 + (glide - 1) * t); phase += 2 * Math.PI * f / RATE; out[i] = Math.sin(phase) * (1 - Math.exp(-i / (0.004 * RATE))) * Math.exp(-t * 5.5) * 0.5 }
    return out
  }
  buffer(samples, volume) { const b = this.ctx.createBuffer(1, samples.length, RATE); const d = b.getChannelData(0); for (let i = 0; i < samples.length; i++) d[i] = samples[i] * volume; return b }
  play(b) { if (!this.ctx || this.ctx.state !== 'running') return; const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start() }
  /** A new cell is under the lens. `speed` is how fast the camera is moving, in screen widths per second. */
  tick(speed, now) {
    if (!this.enabled || !this.ctx || now - this.last < 70) return; this.last = now
    const lvl = Math.min(2, Math.max(0, Math.trunc(Math.min(1, Math.max(0, speed / 2.5)) * 2 + 0.5)))
    this.play(this.ticks[this.n++ % this.ticks.length][lvl])
  }
  /** The camera has come to rest. */
  settle() { if (this.enabled && this.pop) this.play(this.pop) }
}
