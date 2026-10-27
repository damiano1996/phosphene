// @ts-check
/** A small seeded random generator (mulberry32), with Gaussian and integer draws. The same seed always gives the same sequence. */
export class Rng {
  /** @param {number} seed */
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; this.spare = null }
  /** Uniform in [0, 1). */
  float() { this.s = (this.s + 0x6d2b79f5) >>> 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  /** Integer in [0, n). */
  int(n) { return Math.floor(this.float() * n) }
  /** Standard normal (Box-Muller). */
  gauss() {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v }
    let u = 0; while (u === 0) u = this.float()
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * this.float()
    this.spare = r * Math.sin(a); return r * Math.cos(a)
  }
}
