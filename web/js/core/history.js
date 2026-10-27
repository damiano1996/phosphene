// @ts-check
import { T } from './tuning.js'

/**
 * What this person has seen and liked over past launches, kept on this computer only: a score per concept (taps, large views, saves; dismissals count against) that
 * fades a little at every launch, and the concepts the last launches started from.
 */
export class ViewingHistory {
  constructor() { /** @type {Map<number, number>} */ this.liked = new Map(); /** @type {number[]} */ this.recent = [] }
  like(concept, weight) {
    if (concept < 0) return
    const s = (this.liked.get(concept) ?? 0) + weight
    if (s <= 0.05) this.liked.delete(concept); else this.liked.set(concept, Math.min(s, 12))
  }
  /** A new launch started from `start`: older evidence counts for less, and the start is remembered so the next one looks elsewhere. */
  launched(start) {
    for (const [c, v] of [...this.liked]) { const s = v * T.HISTORY_FADE; if (s < 0.05) this.liked.delete(c); else this.liked.set(c, s) }
    this.recent.unshift(start); while (this.recent.length > T.RECENT_STARTS) this.recent.pop()
  }
  /** A plain object, for storing as JSON. */
  toJSON() { return { liked: [...this.liked].map(([c, v]) => [c, Math.round(v * 100) / 100]), recent: this.recent } }
  static from(o) {
    const h = new ViewingHistory(); if (!o) return h
    for (const [c, v] of o.liked ?? []) h.liked.set(c, v)
    h.recent = [...(o.recent ?? [])]; return h
  }
}

/** Chooses which concept a launch starts on, so the centre is not the same picture every time. */
export function pickStart(atlas, history, favourites, rng) {
  if (rng.float() < T.START_FRESH_P) return rng.int(atlas.size)
  const w = new Float64Array(atlas.size).fill(T.START_FLOOR), two = 2 * T.START_TASTE_SIGMA * T.START_TASTE_SIGMA
  for (const [j, s] of history.liked) for (let c = 0; c < w.length; c++) { const d = atlas.distance(atlas.coords[c], j); w[c] += s * Math.exp(-d * d / two) }
  for (const c of favourites) w[c] += T.START_FAVOURITE_BONUS
  history.recent.forEach((r, i) => {
    const keep = 1 - 0.92 * Math.pow(0.7, i)                              // the latest start is nearly ruled out, older ones less and less
    w[r] *= keep
    for (let c = 0; c < w.length; c++) if (c !== r && atlas.distance(atlas.coords[c], r) < 1) w[c] *= 1 - 0.4 * (1 - keep) / 0.92         // and what looks just like it
  })
  let x = rng.float() * w.reduce((a, b) => a + b, 0)
  for (let c = 0; c < w.length; c++) { x -= w[c]; if (x <= 0) return c }
  return w.length - 1
}
