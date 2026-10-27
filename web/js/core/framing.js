// @ts-check
import { T } from './tuning.js'

/**
 * The framed cell: a near-square at the image's aspect ratio, with the whole image inside. It is an ordinary cell of the tessellation. What shapes it is the ring of
 * eight neighbours around it, which slide to the corners of that shape (the diagonal ones slightly inside, which chamfers the corners). Everything is only sites moving,
 * so the cell's outline changes continuously, nothing overlaps and nothing leaves a gap. Frame.f runs 0 (an ordinary cell) to 1 (framed).
 */
export const RING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]       // E SE S SW W NW N NE (screen y points down)

/** owners: the eight sites around `site`, one per RING direction (-1 for none), chosen once when the cell becomes the centre. */
export class Frame { constructor(site, f, owners, aspect) { this.site = site; this.f = f; this.owners = owners; this.aspect = aspect } }
export class Size { constructor() { this.w = 0; this.h = 0 } }

/** Displaces sites (sx, sy) into (rx, ry) so that every frame is surrounded by its ring. sizes receives the image rectangle of each frame. */
export function displace(sx, sy, n, frames, rx, ry, sizes) {
  for (let i = 0; i < n; i++) { rx[i] = sx[i]; ry[i] = sy[i] }
  const f = new Map(); for (const fr of frames) f.set(fr.site, fr.f)
  // A cell that is itself still framed (the previous centre, on its way back) joins another ring only as far as it has stopped being framed.
  const yieldOf = i => (f.has(i) ? 1 - f.get(i) : 1)
  frames.forEach((fr, fi) => {
    const t = fr.site, ds = []
    for (let i = 0; i < n; i++) if (i !== t) ds.push(Math.hypot(sx[i] - sx[t], sy[i] - sy[t]))
    ds.sort((a, b) => a - b)
    const cntM = Math.min(6, ds.length); let m = 0; for (let i = 0; i < cntM; i++) m += ds[i]; m /= cntM
    const b = m * T.FRAME_SCALE, w = b * Math.sqrt(fr.aspect), h = b / Math.sqrt(fr.aspect)
    sizes[fi].w = w * (1 - T.CHAMFER * 0.08); sizes[fi].h = h * (1 - T.CHAMFER * 0.08)
    const ch = T.CHAMFER
    const slot = [[w, 0], [ch * w, ch * h], [0, h], [-ch * w, ch * h], [-w, 0], [-ch * w, -ch * h], [0, -h], [ch * w, -ch * h]]
    const cx = rx[t], cy = ry[t], owned = new Set()
    for (let i = 0; i < 8; i++) {
      const ow = fr.owners[i]; if (ow < 0 || ow === t) continue
      const k = fr.f * yieldOf(ow)
      rx[ow] += (cx + slot[i][0] - rx[ow]) * k; ry[ow] += (cy + slot[i][1] - ry[ow]) * k; owned.add(ow)
    }
    const clear = 1.12 * Math.max(w, h) * fr.f                           // nobody else may crowd into the ring
    for (let i = 0; i < n; i++) {
      if (i === t || owned.has(i)) continue
      const cl = clear * yieldOf(i), dx = rx[i] - cx, dy = ry[i] - cy; let d = Math.hypot(dx, dy); if (d < 1e-6) d = 1
      if (d < cl) { rx[i] = cx + dx / d * cl; ry[i] = cy + dy / d * cl }
    }
  })
}

/** The eight sites that surround cell k, one per RING direction, chosen from the nearest in world space so they stay put while you move. */
export function chooseOwners(world, k) {
  const c = world.node(k); if (!c) return new Array(8).fill(-1)
  const near = world.nearby(c.x, c.y, T.SPACING * 3).filter(n => n.k !== k).slice(0, 12)
  const six = near.slice(0, 6); const mean = six.reduce((s, n) => s + Math.hypot(n.x - c.x, n.y - c.y), 0) / Math.max(1, six.length)
  const used = new Set()
  return RING.map(sd => {
    const sl = Math.hypot(sd[0], sd[1]); let best = -1, bs = Infinity
    for (const m of near) {
      if (used.has(m.k)) continue
      const dx = m.x - c.x, dy = m.y - c.y; let d = Math.hypot(dx, dy); if (d < 1e-6) d = 1
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * sd[0] + dy * sd[1]) / (d * sl)))), sc = ang + 0.3 * d / mean
      if (sc < bs) { bs = sc; best = m.k }
    }
    if (best >= 0) used.add(best); return best
  })
}
