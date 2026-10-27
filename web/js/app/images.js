// @ts-check
import { getJSON } from './api.js'
import { appearanceOf } from '../core/appearance.js'

/**
 * Fetches cell pictures from the engine, nearest-first, and keeps the most recent ones in memory. A browser allows about six connections to one address and a picture
 * request stays open until it is drawn, so at most four are open at once; the rest of the connections are for the look at the pictures being drawn (/peek), one at a time.
 */
export class ImageStore {
  constructor(keep = 600, maxInflight = 4) {
    this.size = 512; this.key = ''; this.steps = 0; this.rawSteps = false
    this.keep = keep; this.maxInflight = maxInflight
    /** @type {Map<number, ImageBitmap>} */ this.cache = new Map()
    /** @type {Map<number, {k: number, z: ArrayLike<number>, seed: number, prio: number, url?: string|null}>} */ this.wants = new Map()
    /** @type {Set<number>} */ this.inflight = new Set()
    /** @type {Map<number, number>} */ this.readyAt = new Map()
    /** @type {Map<number, {bmp: ImageBitmap, step: number, total: number}>} */ this.previews = new Map()
    /** how each finished picture looks (numbers measured on a small copy), by cell */ /** @type {Map<number, Float64Array>} */ this.ap = new Map()
    this.probe = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(48, 48).getContext('2d', { willReadFrequently: true }) : null
    /** the words a reader of pictures gave each picture (a score per word), by cell, and the sentences it wrote */ /** @type {Map<number, Float32Array>} */ this.tags = new Map()
    /** how much of each word of the reader's list a picture shows (against its own average), by cell; and the running mean and spread of each word over all pictures read */ /** @type {Map<number, Float32Array>} */ this.looks = new Map(); this.lookStat = { n: 0, mean: new Float64Array(0), m2: new Float64Array(0) }
    /** @type {Map<number, string>} */ this.captions = new Map(); /** @type {{text: string, at: number}[]} */ this.recentCaptions = []
    /** @type {Map<number, {k: number, z: ArrayLike<number>, seed: number, prio: number}>} */ this.capWants = new Map(); this.capBusy = false
    /** whether a reader is on, and whether it reads every picture ('all') or only the one in the centre ('centre') */ this.reader = { on: false, scope: 'all' }
    this.slow = 0; /** average seconds the engine takes for one picture: a slow model gets a short queue (two at a time, the engine's batch), so what is wanted now is not behind what is no longer */
    this.gen = 0; this.failing = false; this.alive = true
    this.peekLoop()
  }
  /** how many kinds of each concept the model in use draws (1: only the plain concept) */ variants = 1
  get loaded() { return this.cache.size }
  async refreshKey() { const h = await getJSON('/health'); this.key = h.key ?? ''; this.variants = h.variants ?? 1; this.attrsOn = !!h.attrs }

  /** The finished picture, or while it is being drawn the latest preview of it. */
  bitmap(k) { return this.cache.get(k) ?? this.previews.get(k)?.bmp }
  /** (step, total) to show for this cell: how far a picture being drawn has got, or the step count of a finished one; null when nothing is known. */
  stepInfo(k) { const p = this.previews.get(k); if (p) return [p.step, p.total]; return this.cache.has(k) && this.steps > 0 ? [this.steps, this.steps] : null }

  /** `url`: where the picture already is (a saved one), instead of asking the engine to draw the recipe. */
  want(k, z, seed, prio, url = null) {
    if (this.cache.has(k)) return
    const j = this.wants.get(k); if (j) { j.prio = prio; return }
    this.wants.set(k, { k, z, seed, prio, url }); this.pump()
  }
  trim(keep) { for (const k of this.wants.keys()) if (!keep.has(k) && !this.inflight.has(k)) this.wants.delete(k) }
  /** The model changed: nothing that was drawn by the old one may stay. */
  reset() { this.ap.clear(); this.tags.clear(); this.looks.clear(); this.lookStat = { n: 0, mean: new Float64Array(0), m2: new Float64Array(0) }; this.captions.clear(); this.capWants.clear(); this.gen++; for (const b of this.cache.values()) b.close(); for (const p of this.previews.values()) p.bmp.close(); this.cache.clear(); this.readyAt.clear(); this.wants.clear(); this.previews.clear() }
  stop() { this.alive = false }

  zs(z) { return Array.from(z, v => v.toFixed(2)).join(',') }
  pump() {
    while (this.inflight.size < this.maxInflight) {
      let best = null
      for (const j of this.wants.values()) if (!this.inflight.has(j.k) && (best === null || j.prio > best.prio)) best = j
      if (!best) return
      this.run(best)
    }
  }
  async run(j) {
    const gen = this.gen, t0 = performance.now(); this.inflight.add(j.k)
    try {
      const r = await fetch(j.url ?? `/img?s=${this.size}&v=${encodeURIComponent(this.key)}&seed=${j.seed}&z=${this.zs(j.z)}`)
      if (r.status === 409) { await this.refreshKey().catch(() => { }); throw new Error('version') }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const bmp = await createImageBitmap(await r.blob())
      if (gen !== this.gen) { bmp.close(); return }
      if (!j.url) { const dt = (performance.now() - t0) / 1000; this.slow = this.slow ? 0.8 * this.slow + 0.2 * dt : dt; this.maxInflight = this.slow > 3 ? 2 : 4 }
      const had = this.previews.get(j.k); if (had) { this.previews.delete(j.k); had.bmp.close() }
      this.cache.set(j.k, bmp); this.readyAt.set(j.k, performance.now() - (had ? 400 : 0)); this.wants.delete(j.k); this.failing = false
      if (!j.url) this.measure(j.k, bmp, j.seed)
      while (this.cache.size > this.keep) { const old = this.cache.keys().next().value; this.cache.get(old)?.close(); this.cache.delete(old); this.readyAt.delete(old); this.ap.delete(old); this.tags.delete(old); this.captions.delete(old) }
    } catch (e) {
      if (gen === this.gen) { this.failing = true; await new Promise(res => setTimeout(res, 1500)) }       // the cell stays wanted and is tried again
    } finally { this.inflight.delete(j.k); this.pump() }
  }

  /** Asks the reader of pictures (if one is on) to say what a finished picture looks like. With scope 'centre' only the pictures asked for with a high priority are read. */
  wantCaption(k, z, seed, prio) {
    if (!this.reader.on || this.tags.has(k) || !this.cache.has(k)) return
    if (this.reader.scope === 'centre' && prio < 1e8) return
    const w = this.capWants.get(k); if (w) { w.prio = prio; return }
    this.capWants.set(k, { k, z, seed, prio }); this.pumpCaption()
  }
  async pumpCaption() {
    if (this.capBusy) return
    let best = null; for (const w of this.capWants.values()) if (best === null || w.prio > best.prio) best = w
    if (!best) return
    this.capBusy = true; const gen = this.gen; this.capWants.delete(best.k)
    try {
      const r = await fetch(`/caption?s=${this.size}&v=${encodeURIComponent(this.key)}&seed=${best.seed}&z=${this.zs(best.z)}`)
      if (r.ok && gen === this.gen) {
        const o = await r.json(); this.tags.set(best.k, Float32Array.from(o.tags)); if (o.look) this.addLook(best.k, o.look)
        if (o.caption) { this.captions.set(best.k, o.caption); this.recentCaptions.unshift({ text: o.caption, at: Date.now() }); this.recentCaptions.length = Math.min(this.recentCaptions.length, 8) }
      }
    } catch { }
    this.capBusy = false; if (this.capWants.size) setTimeout(() => this.pumpCaption(), 0)
  }

  addLook(k, look) {
    const st = this.lookStat; if (st.mean.length !== look.length) { st.n = 0; st.mean = new Float64Array(look.length); st.m2 = new Float64Array(look.length); this.looks.clear() }          // the list of words changed: start again
    this.looks.set(k, Float32Array.from(look)); st.n++
    for (let i = 0; i < look.length; i++) { const d = look[i] - st.mean[i]; st.mean[i] += d / st.n; st.m2[i] += d * (look[i] - st.mean[i]) }
  }
  /** How much of each of the first `n` words (the attributes) the reader saw in this picture, 0..1 (only what is clearly more than usual counts); null if it has not read it. */
  seen(k, n) {
    const l = this.looks.get(k), st = this.lookStat; if (!l || st.n < 12) return null
    return Float64Array.from({ length: n }, (_, i) => { const sd = Math.sqrt(st.m2[i] / st.n) || 1; return Math.max(0, Math.min(1, (l[i] - st.mean[i]) / (3 * sd))) })
  }

  /** Measures how a finished picture looks (colour, light, detail, composition) on a 48 x 48 copy of it. */
  measure(k, bmp, seed) {
    if (!this.probe) return
    try { this.probe.drawImage(bmp, 0, 0, 48, 48); this.ap.set(k, appearanceOf(this.probe.getImageData(0, 0, 48, 48).data, 48, 48, seed)) } catch { }
  }

  /** The pictures-so-far of those being drawn, one request at a time, a few times a second. */
  async peekLoop() {
    while (this.alive) {
      await new Promise(res => setTimeout(res, 100))
      for (const k of this.previews.keys()) if (!this.inflight.has(k) && !this.cache.has(k)) { this.previews.get(k)?.bmp.close(); this.previews.delete(k) }
      for (const k of [...this.inflight]) {
        const j = this.wants.get(k); if (!j || j.url || this.cache.has(k)) continue
        const gen = this.gen
        try {
          const r = await fetch(`/peek?s=${this.size}&v=${encodeURIComponent(this.key)}&seed=${j.seed}&z=${this.zs(j.z)}${this.rawSteps ? '&raw=1' : ''}`)
          if (r.status !== 200) continue
          const step = +(r.headers.get('X-Step') ?? 0), total = +(r.headers.get('X-Steps') ?? 0)
          const bmp = await createImageBitmap(await r.blob())
          if (gen !== this.gen || this.cache.has(k) || !this.inflight.has(k)) { bmp.close(); continue }
          this.previews.get(k)?.bmp.close(); this.previews.set(k, { bmp, step, total })
        } catch { }
      }
    }
  }
}
