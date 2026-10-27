// @ts-check
import { T } from '../core/tuning.js'
import { Lens } from '../core/lens.js'
import { Voronoi } from '../core/voronoi.js'
import * as Framing from '../core/framing.js'
import { inset } from '../core/poly.js'
import { Discovery } from './discovery.js'
import { downloadPicture } from './download.js'
import { circle, heart, drawHeartButton, drawDismissButton, drawDownloadButton, drawStepBadge, drawToast } from './draw.js'

const SMOOTH = 0.17          // corner rounding of every cell (radius as a share of the cell's size)
const GAP = 0.04             // gap between neighbours, as a share of the cell's size
const LENS_REACH = 0.62      // the lens limit as a share of the window diagonal
/** On a small screen the centre picture grows (up to 30% at 400 px of short side and below), so it stays worth looking at. */
const phoneBoost = cssShort => 1 + 0.3 * clamp((700 - cssShort) / 300, 0, 1)
const UNIT_PX = 1700         // window shorter side per world unit scale: the centre cell takes about half of it and a ring of cells fits around
const MARGIN = 220           // cells this far beyond the screen are still tessellated, so the visible ones have true neighbours
const DOUBLE_MS = 400
const smooth = p => 0.5 - 0.5 * Math.cos(Math.PI * p)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/**
 * The endless sunflower, drawn on a canvas. A fisheye lens, a Voronoi tessellation, the framed centre made by sliding its ring of neighbours into place. All sizes are in
 * device pixels; `dens` (pixels per CSS pixel) turns the fixed sizes of the controls into the same size on every screen.
 *
 * @typedef {{openSettings: () => void, openSaved: (i: number) => void, tick: (speed: number, now: number) => void, settle: () => void}} Hooks
 */
export class Scene {
  /** @param {import('../core/spiral.js').SpiralWorld} world @param {import('../core/atlas.js').Atlas} atlas the categories shown @param {import('../core/atlas.js').Atlas} full @param {import('./images.js').ImageStore} store @param {import('./user.js').UserData} user @param {Hooks} hooks */
  constructor(world, atlas, full, store, user, hooks) {
    world.apProvider = n => { const ap = store.ap.get(n.k); if (!ap) return null; const t = store.tags.get(n.k); if (!t) return ap; const out = new Float64Array(ap.length + t.length); out.set(ap); out.set(t, ap.length); return out }; world.learning = !user.paused; world.variantCount = () => store.variants; world.attrsActive = () => store.attrsOn; world.seenProvider = n => (world.facets ? store.seen(n.k, world.facets.attrs.length) : null); this.likedKs = new Set(); this.likeCount = 0; this.discovery = new Discovery({ world, store, atlas, liked: this.likedKs, notify: text => { this.toast = { text, t0: performance.now(), x: this.width / 2, y: 96 * this.dens } } })
    /** an overlay (settings, saved pictures) is open over the mosaic: nothing is being looked at */ this.suspended = false; this.lastPointer = performance.now()
    this.transK = -1; this.dwellK = -1; this.dwellMs = 0; this.viewerOpenedAt = 0; this.toast = null; this.dismissBtn = { k: -1, x: 0, y: 0, r: 0, a: 0 }
    this.world = world; this.atlas = atlas; this.full = full; this.store = store; this.user = user; this.hooks = hooks
    this.camX = 0; this.camY = 0; this.trans = null; this.dragging = false
    /** @type {Map<number, number>} */ this.frameOf = new Map(); /** @type {Map<number, number[]>} */ this.ownersOf = new Map()
    this.voronoi = new Voronoi(); this.lastT = 0; this.u = 1; this.cells = []; this.siteK = []; this.siteCount = 0
    this.dens = 1; this.width = 0; this.height = 0; this.proj = [0, 0, 0]
    // The large view opens a moment after a click on the centre (so a double click, which saves, never flashes it open); a heart button on the centre picture and in the
    // large view saves or un-saves it with one click.
    this.pendingViewerK = -1; this.pendingViewerAt = 0
    this.heartBtn = { k: -1, x: 0, y: 0, r: 0, a: 0 }; this.downloadBtn = { k: -1, x: 0, y: 0, r: 0, a: 0 }
    this.bestFe = 0; this.bestK = -1; this.bestX = 0; this.bestY = 0
    this.focusK = -1; this.prevCamX = 0; this.prevCamY = 0
    this.viewerK = -1; this.viewerOpening = true; this.viewerT0 = 0
    this.lastTapK = -1; this.lastTapT = 0; this.lastTapX = 0; this.lastTapY = 0
    this.heartT0 = 0; this.heartX = 0; this.heartY = 0
    this.path = null; this.frameCount = 0
    this.logo = new Image(); this.logo.src = 'logo.svg'          // the mark in the middle of the top bar
  }

  /** What the person lingered on, kept on this computer: it decides where the next launch starts. */
  like(k, weight) {
    const n = this.world.node(k); if (!n) return
    this.likedKs.add(k); if (++this.likeCount % 6 === 0) this.discovery.look()
    const full = this.full.names.indexOf(this.atlas.names[this.atlas.nearestConcept(n.z)])      // the history is kept against the whole map, whatever categories are hidden now
    if (full >= 0) { this.user.history.like(full, weight); this.user.saveHistory() }
  }

  // The bar of saved images along the top: an outlined heart (all of them), then the newest ones as small round thumbnails.
  get barSize() { return 44 * this.dens } get barGap() { return 10 * this.dens } get barLeft() { return 20 * this.dens }
  barBottom() { return 12 * this.dens + this.barSize + 12 * this.dens }
  barX(slot) { return this.barLeft + slot * (this.barSize + this.barGap) }
  /** How many of the heart and thumbnails fit in the left half of the bar (the middle belongs to the logo, the right to the settings). */
  barSlots() { return Math.max(1, Math.min(this.user.saved.length + 1, Math.trunc((this.width / 2 - 26 * this.dens - 2 * this.barLeft + this.barGap) / (this.barSize + this.barGap)))) }
  barVisible() { return this.user.saved.length > 0 && this.viewerK < 0 }
  gearX() { return this.width - this.barLeft - this.barSize / 2 }
  inGear(x, y) { return this.viewerK < 0 && Math.hypot(x - this.gearX(), y - (12 * this.dens + this.barSize / 2)) <= this.barSize * 0.7 }
  /** -1 for the heart, the saved image's index for a thumbnail, -2 outside the bar. */
  barHit(x, y) {
    if (!this.barVisible() || y < 0 || y > 12 * this.dens + this.barSize + 10 * this.dens || x < 0 || x > this.barX(this.barSlots())) return -2      // (generous at the screen's edge: a thumb does not aim at a 44 px target)
    const slot = Math.max(0, Math.trunc((x - this.barLeft + this.barGap / 2) / (this.barSize + this.barGap)))
    return slot === 0 ? -1 : Math.min(slot - 1, this.user.saved.length - 1)
  }
  barKey(i) { return -1 - (this.user.saved[i].seed & 0x3fffffff) }

  /** The large view is closed: how long it was looked at is a signal about that picture. */
  endViewer() {
    const k = this.viewerK, ms = performance.now() - this.viewerOpenedAt - 260; this.viewerK = -1
    if (k >= 0 && !this.suspended && document.visibilityState === 'visible') this.world.dwell(k, Math.min(ms, 30000))
  }
  /** Time spent resting on the centre picture (camera still, nothing open, page visible, someone there) is a signal; it ends here. */
  endDwell() { if (this.dwellK >= 0 && this.dwellMs >= T.DWELL_MIN_MS) this.world.dwell(this.dwellK, Math.min(this.dwellMs, 30000)); this.dwellK = -1; this.dwellMs = 0 }
  touch() { this.lastPointer = performance.now() }

  closeViewer() { if (this.viewerK < 0 || !this.viewerOpening) return this.viewerK >= 0; this.viewerOpening = false; this.viewerT0 = performance.now(); return true }

  /** A click on a cell: the centre opens larger, any other cell comes to the centre; a second click soon after on the same spot saves it. */
  click(x, y) {
    const now = performance.now()
    const hb = this.heartButtonAt(x, y); if (hb !== null) { this.toggleSaved(hb, x, y); return }
    const dl = this.downloadBtn; if (dl.k >= 0 && Math.hypot(x - dl.x, y - dl.y) <= dl.r) { this.download(dl.k); return }
    const db = this.dismissBtn; if (db.k >= 0 && db.a >= 0.5 && this.viewerK < 0 && Math.hypot(x - db.x, y - db.y) <= db.r) { this.dismiss(db.k); return }
    if (this.lastTapK >= 0 && now - this.lastTapT <= DOUBLE_MS && Math.hypot(x - this.lastTapX, y - this.lastTapY) <= 48 * this.dens) { this.doubleClick(x, y); return }
    if (this.viewerK >= 0) { this.closeViewer(); return }
    if (this.inGear(x, y)) { this.hooks.openSettings(); return }
    const b = this.barHit(x, y); if (b > -2) { this.hooks.openSaved(b); return }
    const k = this.hit(x, y); if (k === null) return
    this.lastTapK = k; this.lastTapT = now; this.lastTapX = x; this.lastTapY = y
    if ((this.frameOf.get(k) ?? 0) > 0.5) { this.pendingViewerK = k; this.pendingViewerAt = now + DOUBLE_MS }
    else { this.like(k, 1); this.go(k) }
  }
  doubleClick(x, y) {
    const k = this.lastTapK; this.lastTapK = -1
    const n = this.world.node(k); if (!n) return
    this.pendingViewerK = -1; this.viewerK = -1          // the first click was the start of this one, not a request to see the picture larger
    this.save(n); this.heartT0 = performance.now(); this.heartX = x; this.heartY = y; this.like(k, 3)
  }
  /** "Not for me": the picture stays where it is (the world never rewrites), but the model learns it was worse than what is next to it. */
  dismiss(k) {
    const n = this.world.node(k); if (!n || this.world.isDismissed(k)) return
    const ref = this.world.nearby(n.x, n.y, 2 * T.SPACING).find(m => m.k !== k && !this.world.isDismissed(m.k)); if (!ref) return
    this.world.dismiss(k, ref.k); const full = this.full.names.indexOf(this.atlas.names[this.atlas.nearestConcept(n.z)])
    if (full >= 0) { this.user.history.like(full, -1.5); this.user.saveHistory() }
    this.toast = { text: this.world.learning ? 'Noted: fewer like this' : 'Hidden (learning is paused)', t0: performance.now(), x: this.dismissBtn.x, y: this.dismissBtn.y }
  }
  isSaved(k) { const n = this.world.node(k); return n ? this.user.has(n.z, n.seed, this.store.key) : false }
  /** Saves this cell's picture (as it is now). */
  save(n) { const it = this.user.addSaved(n.z, n.seed, this.store.key, this.store.size); if (it) { this.user.persistImage(it); this.world.save(n.k) } return !!it }
  heartButtonAt(x, y) { const h = this.heartBtn; return h.k < 0 || h.a < 0.5 || Math.hypot(x - h.x, y - h.y) > h.r ? null : h.k }
  /** One click: saves the picture, or takes it out of the saved ones again. */
  toggleSaved(k, x, y) {
    const n = this.world.node(k); if (!n) return
    const i = this.user.indexOf(n.z, n.seed, this.store.key)
    if (i >= 0) { this.user.removeSavedAt(i); this.world.unsave(k) }
    else { this.save(n); this.heartT0 = performance.now(); this.heartX = x; this.heartY = y; this.like(k, 3) }
  }

  startTrans(k) {
    const n = this.world.node(k); if (!n) return
    const dur = clamp(520 + Math.hypot(n.x - this.camX, n.y - this.camY) * 2, 520, T.TRANSITION_MS)
    this.trans = { t0: performance.now(), dur, cx: this.camX, cy: this.camY, tx: n.x, ty: n.y }; this.transK = k
  }
  /** After a drag the camera glides onto the cell nearest the middle: navigation, not a vote. */
  settle() { const n = this.world.nearby(this.camX, this.camY, 2 * T.SPACING)[0]; if (n) this.startTrans(n.k) }
  go(k) {
    const n = this.world.node(k); if (!n) return
    this.world.pick(k); this.ownersOf.set(k, Framing.chooseOwners(this.world, k)); this.startTrans(k)
    this.world.ensure(n.x, n.y, 2400)
  }
  hit(x, y) {
    for (let i = 0; i < this.siteCount; i++) {
      const p = this.cells[i]; if (!p) continue
      const m = p.length / 2; let sign = 0, inside = true
      for (let v = 0; v < m; v++) {
        const j = (v + 1) % m, cr = (p[2 * j] - p[2 * v]) * (y - p[2 * v + 1]) - (p[2 * j + 1] - p[2 * v + 1]) * (x - p[2 * v])
        if (Math.abs(cr) < 1e-4) continue
        const s = cr > 0 ? 1 : -1
        if (sign === 0) sign = s; else if (s !== sign) { inside = false; break }
      }
      if (inside) return this.siteK[i]
    }
    return null
  }

  roundedPath(p, k, rr) {
    const path = new Path2D(), m = p.length / 2, rho = k * rr
    for (let i = 0; i < m; i++) {
      const ax = p[2 * ((i + m - 1) % m)], ay = p[2 * ((i + m - 1) % m) + 1], bx = p[2 * i], by = p[2 * i + 1], cx = p[2 * ((i + 1) % m)], cy = p[2 * ((i + 1) % m) + 1]
      const l1 = Math.max(1e-3, Math.hypot(ax - bx, ay - by)), l2 = Math.max(1e-3, Math.hypot(cx - bx, cy - by))
      const cosT = clamp(((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / (l1 * l2), -1, 1), half = Math.acos(cosT) / 2
      const trim = Math.max(rho / Math.tan(clamp(half, 0.12, 1.55)), rho * 0.5)
      const t1 = Math.min(0.46, trim / l1), t2 = Math.min(0.46, trim / l2)
      const sx = bx + (ax - bx) * t1, sy = by + (ay - by) * t1
      if (i === 0) path.moveTo(sx, sy); else path.lineTo(sx, sy)
      path.quadraticCurveTo(bx, by, bx + (cx - bx) * t2, by + (cy - by) * t2)
    }
    path.closePath(); return path
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {number} dens @param {number} now */
  render(ctx, w, h, dens, now) {
    const world = this.world, store = this.store, user = this.user
    this.u = Math.min(w, h) / UNIT_PX * phoneBoost(Math.min(w, h) / dens); this.dens = dens; this.width = w; this.height = h; const u = this.u
    if (this.pendingViewerK >= 0 && now >= this.pendingViewerAt) { const k = this.pendingViewerK; this.pendingViewerK = -1; this.like(k, 1.5); this.endDwell(); world.pick(k, 'view', T.VIEW_WEIGHT); this.viewerK = k; this.viewerOpening = true; this.viewerT0 = now; this.viewerOpenedAt = now }
    this.bestFe = 0; this.bestK = -1
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    const lens = new Lens(LENS_REACH * Math.hypot(w, h))
    // the world radius whose lens image reaches a little past the window corners
    const tCorner = -Math.log(1 - Math.min(0.97, 1.1 * 0.5 * Math.hypot(w, h) / lens.limit)), rView = lens.limit / T.LENS_A * tCorner / u
    if (this.trans) {
      const t = this.trans, p = Math.min(1, (now - t.t0) / t.dur), e = smooth(p)
      this.camX = t.cx + (t.tx - t.cx) * e; this.camY = t.cy + (t.ty - t.cy) * e
      if (p >= 1) { this.trans = null; this.hooks.settle() }
    }
    world.ensure(this.camX, this.camY, rView * 1.25)
    const dtf = Math.min(50, Math.max(0, now - this.lastT)); this.lastT = now
    // a soft tick each time a different cell becomes the centre (only once it is clearly nearer, so two at the same distance do not take turns)
    const camSpeed = dtf > 0 ? Math.hypot(this.camX - this.prevCamX, this.camY - this.prevCamY) * u / w * 1000 / dtf : 0; this.prevCamX = this.camX; this.prevCamY = this.camY
    const under = world.nearby(this.camX, this.camY, 2 * T.SPACING)[0]
    if (under && under.k !== this.focusK) {
      const cur = world.node(this.focusK)
      if (!cur || Math.hypot(under.x - this.camX, under.y - this.camY) < Math.hypot(cur.x - this.camX, cur.y - this.camY) - T.FRAME_HYSTERESIS * T.SPACING) { this.focusK = under.k; if (camSpeed > 0.15) this.hooks.tick(camSpeed, now) }
    }

    world.learning = !user.paused
    const looking = !this.trans && !this.dragging && this.viewerK < 0 && !this.suspended && document.visibilityState === 'visible' && now - this.lastPointer < 90000
    if (looking && this.focusK >= 0 && this.focusK === this.dwellK) this.dwellMs += dtf
    else { this.endDwell(); if (looking && this.focusK >= 0) { this.dwellK = this.focusK; this.dwellMs = 0 } }

    // How framed each cell is follows how near the camera is to it, continuously: the cell at the centre is the big one.
    const reach = T.SPACING * T.FRAME_REACH, weight = new Map()
    for (const c of world.nearby(this.camX, this.camY, reach)) weight.set(c.k, smooth(clamp(1 - Math.hypot(c.x - this.camX, c.y - this.camY) / reach, 0, 1)))
    for (const k of weight.keys()) if (!this.frameOf.has(k)) this.frameOf.set(k, 0)
    for (const [k, v] of [...this.frameOf]) {
      const target = weight.get(k) ?? 0
      let nv = v; if (v !== target) nv = target > v ? Math.min(target, v + dtf / T.FRAME_FOLLOW_MS) : Math.max(target, v - dtf / T.FRAME_FOLLOW_MS)
      if (nv <= 0.0005 && target === 0) this.frameOf.delete(k); else this.frameOf.set(k, nv)
    }

    const margin = MARGIN * u, cand = world.nearby(this.camX, this.camY, rView)
    const xs = new Float64Array(cand.length), ys = new Float64Array(cand.length), ks = new Array(cand.length); let n = 0
    for (const c of cand) {
      lens.project((c.x - this.camX) * u, (c.y - this.camY) * u, this.proj)
      const sx = w / 2 + this.proj[0], sy = h / 2 + this.proj[1]
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue
      xs[n] = sx; ys[n] = sy; ks[n] = c.k; n++
    }
    this.siteCount = n; this.siteK = ks
    if (n < 3) return
    const indexOf = new Map(); for (let i = 0; i < n; i++) indexOf.set(ks[i], i)

    const rx = new Float64Array(n), ry = new Float64Array(n), frames = [], sizes = []
    for (const [k, f] of this.frameOf) {
      const i = indexOf.get(k); if (i === undefined || f <= 0.001) continue
      let owners = this.ownersOf.get(k); if (!owners) { owners = Framing.chooseOwners(world, k); this.ownersOf.set(k, owners) }
      const bmp = store.bitmap(k)
      frames.push(new Framing.Frame(i, smooth(f), owners.map(ow => (ow < 0 ? -1 : (indexOf.get(ow) ?? -1))), bmp ? bmp.width / bmp.height : 1)); sizes.push(new Framing.Size())
    }
    Framing.displace(xs, ys, n, frames, rx, ry, sizes)
    // The mosaic ends at the four edges of the screen (at its top, at the lower edge of the saved-images bar): the cells there are closed with the same gap and rounded corners, never cut.
    const topEdge = this.barBottom()
    this.cells = this.voronoi.cells(rx, ry, n, 0, topEdge, w, h)
    const spacing = this.voronoi.spacing, keep = new Set()

    ctx.imageSmoothingQuality = 'medium'
    ctx.save(); ctx.beginPath(); ctx.rect(0, topEdge, w, h - topEdge); ctx.clip()          // nothing of the mosaic is ever drawn over the bar (a sliver of a cell can poke out of its own cell)
    for (let i = 0; i < n; i++) {
      const poly = this.cells[i]; if (!poly) continue
      const k = ks[i], node = world.node(k); if (!node) continue
      const deq = spacing[i], cx = rx[i], cy = ry[i]
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, ch = 0
      for (let v = 0; v < poly.length / 2; v++) { const px = poly[2 * v], py = poly[2 * v + 1]; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); ch = Math.max(ch, Math.max(Math.abs(px - cx), Math.abs(py - cy))) }
      if (x1 < 0 || x0 > w || y1 < 0 || y0 > h) continue
      store.want(k, node.z, node.seed, -Math.hypot(cx - w / 2, cy - h / 2) + (k === this.transK ? 1e6 : 0)); keep.add(k)          // the engine draws from the centre of the screen outwards, the cell being gone to first of all

      const gt = clamp(deq * GAP, 2.5 * u, 12 * u), wl = clamp(deq * 0.008, 1.2 * u, 2.4 * u)
      const q = inset(poly, gt / 2 + wl / 2, cx, cy); if (!q) continue
      let meanR = 0; for (let v = 0; v < q.length / 2; v++) meanR += Math.hypot(q[2 * v] - cx, q[2 * v + 1] - cy); meanR /= q.length / 2
      const path = this.roundedPath(q, SMOOTH, meanR)

      const ph = this.atlas.placeholder(node.z)
      ctx.fillStyle = `rgb(${ph[0]},${ph[1]},${ph[2]})`; ctx.fill(path)
      const bmp = store.bitmap(k)
      if (bmp) {
        if (store.reader.on) store.wantCaption(k, node.z, node.seed, (k === this.focusK ? 1e9 : 0) + deq)
        const fade = clamp((now - (store.readyAt.get(k) ?? 0)) / 280, 0, 1)
        const fi = frames.findIndex(f => f.site === i), fe = fi >= 0 ? frames[fi].f : 0
        const half = Math.max(0.62 * deq, ch)           // the image must always cover the whole cell
        let bx = cx - half, by = cy - half, bw = 2 * half, bh = 2 * half
        if (fi >= 0) {                                  // grows from a cover-fit of the cell into the whole image at its own proportions
          let qx0 = Infinity, qx1 = -Infinity, qy0 = Infinity, qy1 = -Infinity
          for (let v = 0; v < q.length / 2; v++) { qx0 = Math.min(qx0, q[2 * v]); qx1 = Math.max(qx1, q[2 * v]); qy0 = Math.min(qy0, q[2 * v + 1]); qy1 = Math.max(qy1, q[2 * v + 1]) }
          const asp = bmp.width / bmp.height, tw = Math.max(qx1 - qx0, (qy1 - qy0) * asp), th = tw / asp, tcx = (qx0 + qx1) / 2, tcy = (qy0 + qy1) / 2
          if (fe > this.bestFe) { this.bestFe = fe; this.bestK = k; this.bestX = tcx; this.bestY = Math.min(qy1, tcy + th / 2) - 34 * dens }
          bx += (tcx - tw / 2 - bx) * fe; by += (tcy - th / 2 - by) * fe; bw += (tw - bw) * fe; bh += (th - bh) * fe
        }
        const draft = !store.cache.has(k)          // a picture still being drawn: pale and grey, so a finished one is told at a glance
        ctx.save(); ctx.clip(path); ctx.globalAlpha = draft ? 0.6 : fade
        if (draft) ctx.filter = 'grayscale(1)'
        try { ctx.drawImage(bmp, bx, by, bw, bh) } catch { }
        ctx.restore()
      }
      if (world.isDismissed(k)) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(path) }
      ctx.lineWidth = wl; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke(path)
    }
    ctx.restore()
    for (let i = 0; i < user.saved.length; i++) keep.add(this.barKey(i))
    store.trim(keep)
    // the heart button on the centre picture (it fades in as that picture settles into the centre)
    this.heartBtn.k = -1; this.downloadBtn.k = -1
    if (this.viewerK < 0 && this.bestK >= 0 && this.bestFe > 0.7) {
      const a = clamp((this.bestFe - 0.7) / 0.3, 0, 1)
      Object.assign(this.heartBtn, { k: this.bestK, x: this.bestX, y: this.bestY, r: 24 * dens, a })
      this.drawHeartButton(ctx, this.bestK, this.bestX, this.bestY, a); this.drawStepBadge(ctx, this.bestK, this.bestX + 22 * dens + 10 * dens, this.bestY, a)
      Object.assign(this.dismissBtn, { k: this.bestK, x: this.bestX - 22 * dens - 10 * dens - 17 * dens, y: this.bestY, r: 20 * dens, a }); this.drawDismissButton(ctx, this.dismissBtn)
    } else this.dismissBtn.k = -1
    this.drawSavedUi(ctx, now)
    this.drawViewer(ctx, w, h, now)
    this.drawToast(ctx, now)
  }

  /** Saves the picture of this cell as a file. */
  download(k) { const bmp = this.store.bitmap(k), n = this.world.node(k); if (bmp && n) downloadPicture(bmp, n.seed) }
  drawDownloadButton(ctx, b) { drawDownloadButton(ctx, b, this.dens) }
  drawDismissButton(ctx, b) { drawDismissButton(ctx, b, this.dens) }
  drawToast(ctx, now) { if (this.toast && !drawToast(ctx, this.toast, now, this.dens)) this.toast = null }
  heart(ctx, cx, cy, size, color, alpha, stroke) { heart(ctx, cx, cy, size, color, alpha, stroke) }
  circle(ctx, x, y, r, fill) { circle(ctx, x, y, r, fill) }
  drawHeartButton(ctx, k, x, y, a) { drawHeartButton(ctx, x, y, a, this.dens, this.isSaved(k)) }
  drawStepBadge(ctx, k, left, y, a) { const info = this.store.stepInfo(k); if (info) drawStepBadge(ctx, info, left, y, a, this.dens, this.width / this.dens < 560) }

  /** The pop of a heart where you double clicked, and the saved bar: an outlined heart that opens them all, then the newest as round thumbnails. */
  drawSavedUi(ctx, now) {
    const d = this.dens, t = (now - this.heartT0) / 800
    if (this.heartT0 > 0 && t >= 0 && t <= 1) {
      const grow = t < 0.25 ? t / 0.25 * 1.2 : 1.2 - 0.2 * Math.min((t - 0.25) / 0.75, 1), a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      const s = 64 * d * grow, y = this.heartY - 16 * d * t
      this.heart(ctx, this.heartX, y + 2 * d, s, '#000', a * 0.25); this.heart(ctx, this.heartX, y, s, '#fff', a)
    }
    if (this.viewerK >= 0) return
    const cy = 12 * d + this.barSize / 2, gx = this.gearX(), ink = '#1a1a1a'
    if (this.logo.complete && this.logo.naturalWidth) { const ls = 28 * d; ctx.drawImage(this.logo, this.width / 2 - ls / 2, cy - ls / 2, ls, ls) }
    ctx.save(); ctx.lineCap = 'round'                 // settings: three sliders, drawn
    ;[0.3, 0.7, 0.45].forEach((knob, i) => {
      const ly = cy + (i - 1) * 8 * d, x0 = gx - 11 * d, x1 = gx + 11 * d, kx = x0 + (x1 - x0) * knob
      ctx.strokeStyle = ink; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke()
      this.circle(ctx, kx, ly, 3.6 * d, '#fff'); ctx.beginPath(); ctx.arc(kx, ly, 3.6 * d, 0, 2 * Math.PI); ctx.stroke()
    })
    ctx.restore()
    if (!this.barVisible()) return
    const slots = this.barSlots()
    this.heart(ctx, this.barX(0) + this.barSize / 2, cy, 22 * d, ink, 1, 2.2)
    for (let slot = 1; slot < slots; slot++) {
      const i = slot - 1, item = this.user.saved[i], key = this.barKey(i)
      this.store.want(key, item.z, item.seed, 1e9 - slot, item.id ? `/saved/${item.id}.jpg` : null)       // always ahead of the mosaic cells (their priority is in the thousands)
      const cx = this.barX(slot) + this.barSize / 2, r = this.barSize / 2
      this.circle(ctx, cx, cy + d, r + 3 * d, 'rgba(0,0,0,.12)'); this.circle(ctx, cx, cy, r + 2 * d, '#fff')
      const bmp = this.store.bitmap(key)
      if (!bmp) this.circle(ctx, cx, cy, r, '#ddd')
      else { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip(); try { ctx.drawImage(bmp, cx - r, cy - r, 2 * r, 2 * r) } catch { } ctx.restore() }
    }
  }

  /** The large view: the picture on a white rounded border (Instagram style) over a dimmed screen. */
  drawViewer(ctx, w, h, now) {
    if (this.viewerK < 0) return
    const d = this.dens, raw = clamp((now - this.viewerT0) / 260, 0, 1), t = this.viewerOpening ? raw : 1 - raw
    if (!this.viewerOpening && raw >= 1) { this.endViewer(); return }
    const e = t * t * (3 - 2 * t)
    ctx.fillStyle = `rgba(0,0,0,${0.92 * e})`; ctx.fillRect(0, 0, w, h)
    const bmp = this.store.bitmap(this.viewerK); if (!bmp) return
    const cx = w / 2, cy = h / 2, pad = 14 * d, rad = 28 * d, side = Math.max(Math.min(w, h) - 150 * d, Math.min(w - 2 * pad - 16 * d, h - 190 * d)) * (0.4 + 0.6 * e)    // (a phone gets nearly the whole width; the heart row is kept below)
    for (let g = 4; g >= 1; g--) { const sp = g * 5 * d; ctx.fillStyle = `rgba(0,0,0,${0.07 * e})`; ctx.beginPath(); ctx.roundRect(cx - side / 2 - pad - sp, cy - side / 2 - pad - sp + 4 * d, side + 2 * pad + 2 * sp, side + 2 * pad + 2 * sp, rad + pad + sp); ctx.fill() }
    ctx.fillStyle = `rgba(255,255,255,${e})`; ctx.beginPath(); ctx.roundRect(cx - side / 2 - pad, cy - side / 2 - pad, side + 2 * pad, side + 2 * pad, rad + pad); ctx.fill()
    if (e > 0.95 && this.viewerOpening) {
      const hy = cy + side / 2 + pad + 34 * d
      Object.assign(this.heartBtn, { k: this.viewerK, x: cx, y: hy, r: 26 * d, a: 1 })
      this.drawHeartButton(ctx, this.viewerK, cx, hy, 1); this.drawStepBadge(ctx, this.viewerK, cx + 26 * d + 12 * d, hy, 1)
      Object.assign(this.downloadBtn, { k: this.viewerK, x: cx - 26 * d - 12 * d - 17 * d, y: hy, r: 20 * d, a: 1 }); this.drawDownloadButton(ctx, this.downloadBtn)
    } else if (this.viewerK >= 0) { this.heartBtn.k = -1; this.downloadBtn.k = -1 }
    ctx.save(); ctx.globalAlpha = e; ctx.beginPath(); ctx.roundRect(cx - side / 2, cy - side / 2, side, side, rad); ctx.clip()
    ctx.imageSmoothingQuality = 'high'; try { ctx.drawImage(bmp, cx - side / 2, cy - side / 2, side, side) } catch { }
    ctx.restore()
  }

}

