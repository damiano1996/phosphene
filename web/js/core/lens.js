// @ts-check
import { T } from './tuning.js'

/**
 * A fisheye: distance d from the centre (in px) maps to limit * (1 - exp(-d / D)), with D = limit / a. The slope at the middle is a (everything is magnified)
 * and falls off smoothly, so a far cell is small and compressed. The mapped distance never exceeds `limit`, so choose it to reach past the screen corners.
 */
export class Lens {
  constructor(limit, a = T.LENS_A) { this.limit = limit; this.a = a; this.d = limit / a }
  /** Writes screen offset (x, y) from the centre and the local magnification into out[0..2]. */
  project(vx, vy, out) {
    const r = Math.hypot(vx, vy), t = r / this.d
    const k = r < 1e-3 ? this.a : this.limit * (1 - Math.exp(-t)) / r
    out[0] = vx * k; out[1] = vy * k; out[2] = this.a * Math.exp(-t)
  }
}
