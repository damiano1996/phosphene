// @ts-check
import { T } from './tuning.js'
import { Rng } from './rng.js'
import { PreferenceModel } from './preference.js'
import { withAttrs } from './facets.js'
import { STYLE_BY_SEED, AP_TRAITS, AP_BASE, styleOnly } from './appearance.js'

const GOLDEN = Math.PI * (3 - 2.23606797749979)       // 137.5 degrees
const C = T.SPACING / 1.9046

/**
 * Position of spiral cell k. In a Vogel spiral r = c*sqrt(k); neighbouring cells end up sqrt(2*pi/sqrt(3)) = 1.904 c apart, so c is chosen to make that distance SPACING.
 */
export const Vogel = {
  x: k => C * Math.sqrt(k + 0.5) * Math.cos((k * GOLDEN) % (2 * Math.PI)),
  y: k => C * Math.sqrt(k + 0.5) * Math.sin((k * GOLDEN) % (2 * Math.PI)),
}

/** @typedef {{k: number, x: number, y: number, z: Float64Array, seed: number}} Node */

/**
 * An endless sunflower of cells. Cell k sits at radius c*sqrt(k+0.5), angle k*golden angle, so the plane is covered at an even density in every direction, forever. A cell
 * exists only once it has been generated, and a cell never changes. What a cell shows is a point of the concept atlas (what: the nearest concept) and a seed (which one:
 * composition, colours, style), so the same concept looks different in every cell. Cells are generated lazily, wherever the viewer is heading (ensure), and only next to
 * cells that already exist, so the world grows outwards like a colony. The recommender decides what a new cell is: mostly the mean of its nearest neighbours moved towards
 * the concept, among those nearby, that a Thompson sample of the learned preference likes best (exploit), or one step along a smooth random flow (explore); sometimes a
 * jump: an island of a category that is rare in view. Picks and dismissals are the feedback.
 */
export class SpiralWorld {
  /** @param {number} seed @param {import('./atlas.js').Atlas} atlas @param {{learn?: boolean, jumps?: boolean, startConcept?: number|null, diversify?: boolean, tags?: number, facets?: import('./facets.js').Facets|null}} [opt] */
  constructor(seed, atlas, opt = {}) {
    const { learn = true, jumps = true, startConcept = null, diversify = true, tags = 0, facets = null } = opt
    this.atlas = atlas; this.learn = learn; this.jumps = jumps; this.diversify = diversify
    this.dim = atlas.dim; this.rng = new Rng(seed); this.worldSeed = seed | 0
    this.facets = facets; this.model = new PreferenceModel(seed * 7919 + 13, this.dim, { tags, attrs: facets ? facets.A : 0 })
    /** how many kinds of each concept the model that draws the pictures makes (1: only the plain concept), set by whoever knows it */ this.variantCount = () => 1
    /** whether that model also makes the attributes written in a seed */ this.attrsActive = () => false
    /** what the reader of pictures saw of the attributes in a cell's picture (0..1 each), if it has read it: (node) => Float64Array|null */ this.seenProvider = () => null
    /** whether signals are learned from (the person can pause it) */ this.learning = true
    /** how a cell's picture looks, if it is known: (node) => Float64Array|null, set by whoever has the pictures */ this.apProvider = () => null
    /** @type {Map<number, Node>} */ this.nodes = new Map()
    /** @type {Map<string, Node[]>} */ this.grid = new Map()
    this.bucket = T.SPACING * 1.5
    this.dismissed = new Set(); this.lastEnsure = null
    // A smooth random vector field over the plane (a few sine waves per dimension). Exploration steps follow it instead of an independent random direction: independent
    // directions cancel out, so the world would barely drift and every region would look alike.
    this.flowK = Array.from({ length: 3 }, () => Array.from({ length: this.dim }, () => [this.rng.gauss(), this.rng.gauss()]))
    this.flowPhase = Array.from({ length: 3 }, () => Float64Array.from({ length: this.dim }, () => this.rng.float() * 2 * Math.PI))
    this.focusK = 0; this.picks = 0
    this.dwelled = new Map(); this.dwellTotal = new Map(); this.priorConcepts = []
    const c = startConcept ?? this.rng.int(atlas.size)
    this.add({ k: 0, x: 0, y: 0, z: Float64Array.from(atlas.coords[c]), seed: this.seedFor(0) })
  }
  get size() { return this.nodes.size }
  get all() { return this.nodes.values() }
  get focus() { return /** @type {Node} */ (this.nodes.get(this.focusK)) }
  get dismissals() { return this.dismissed.size }

  /** A cell's seed, with the bits that ask for attributes cleared (see facets.js): a cell asks for an attribute only when the recommender says so. */
  seedFor(k) { const m = Math.imul((Math.imul(this.worldSeed, 31) + k) | 0, -1640531535); return withAttrs((m ^ (m >>> 15)) & 0x7fffffff, []) }

  /**
   * The seed of a new cell, with its style (photo, close-up, painting: the engine takes it from the seed) chosen by Thompson sampling on what the person has favoured: the engine's own
   * odds (4/8, 3/8, 1/8) are the starting point and a favoured style becomes more likely, never certain. The low bits of the seed are what pick the style; the rest still varies.
   */
  styledSeed(k, concept = null) {
    const seed = this.seedFor(k); if (!this.learn || this.model.events < T.MIN_PICKS_TO_EXPLOIT) return seed
    const ws = this.model.sample(), base = this.model.nz + AP_TRAITS.length, odds = [4 / 8, 3 / 8, 1 / 8]
    const sc = T.AP_SCALE, logit = odds.map((o, i) => Math.log(o) + 0.8 * sc * ws[base + i] - 0.8 * sc * (ws[base] + ws[base + 1] + ws[base + 2]) / 3)
    const mx = Math.max(...logit), p = logit.map(v => Math.exp(v - mx)); let r = this.rng.float() * p.reduce((a, b) => a + b, 0), style = 0
    while (style < 2 && r > p[style]) { r -= p[style]; style++ }
    const slots = STYLE_BY_SEED.map((st, i) => (st === style ? i : -1)).filter(i => i >= 0)
    return this.withVariant((seed & ~7) | slots[(seed >>> 3) % slots.length], concept)
  }

  /**
   * The finer kind of the concept and the attributes it asks for (see facets.js), chosen the way the style is: by Thompson sampling on what the person has favoured about how pictures
   * look. The plain concept keeps the largest share and a favoured attribute makes the kinds and compositions that carry it more likely, never certain. Before there is anything learned,
   * some cells get one attribute at random, or the model would never see one and could not learn from it. Candidates are the few attributes the model rates best plus a couple at
   * random: with dozens of attributes it has never seen, a plain draw over all of them would be noise.
   */
  withVariant(seed, concept) {
    const f = this.facets, n = this.variantCount(); if (!f || concept == null) return seed
    const learned = this.learn && this.model.events >= T.MIN_PICKS_TO_EXPLOIT
    if (!this.vSample || this.vSample.events !== this.model.events || this.vSample.uses++ >= T.TASTE_REUSE) this.vSample = { events: this.model.events, uses: 0, ws: this.model.sample() }
    const name = this.atlas.names[concept], ws = this.vSample.ws
    let variant = f.variantOf(seed, n)
    if (n > 1 && learned) {
      const logit = Array.from({ length: n }, (_, v) => { const a = this.attrsAppearance(name, v, seed); return Math.log(v === 0 ? 0.34 : 0.22) + T.VARIANT_BETA * this.model.appearanceUtilityWith(ws, a) })
      const mx = Math.max(...logit), p = logit.map(v => Math.exp(v - mx)); let r = this.rng.float() * p.reduce((a, b) => a + b, 0), v = 0
      while (v < n - 1 && r > p[v]) { r -= p[v]; v++ }
      variant = v; seed = f.withVariant(seed, v, n)
    }
    if (!this.attrsActive()) return seed
    const have = new Set([...f.attrsOf(name, variant, 0, false)].map((x, i) => (x ? i : -1)).filter(i => i >= 0)), cat = this.atlas.categories[concept]
    const pool = []; for (let i = 0; i < Math.min(f.attrs.length, this.model.attrs); i++) if (!have.has(i) && f.fits(i, cat)) pool.push(i)
    if (!pool.length) return seed
    const r0 = this.rng.float(), want = r0 < T.ATTR_NONE ? 0 : r0 < T.ATTR_NONE + T.ATTR_ONE ? 1 : 2, chosen = []
    for (let k = 0; k < want && pool.length; k++) {
      let cands
      if (!learned) cands = [pool[this.rng.int(pool.length)]]
      else {
        const byMean = [...pool].sort((x, y) => this.model.attrMean(y) - this.model.attrMean(x)).slice(0, T.ATTR_TOP), extra = Array.from({ length: T.ATTR_RANDOM }, () => pool[this.rng.int(pool.length)])
        cands = [...new Set([...byMean, ...extra])]
      }
      const u = cands.map(i => this.model.attrUtilityWith(ws, i)), mx = Math.max(...u), p = u.map(x => Math.exp(T.ATTR_BETA * (x - mx))); let r = this.rng.float() * p.reduce((a, b) => a + b, 0), j = 0
      while (j < p.length - 1 && r > p[j]) { r -= p[j]; j++ }
      chosen.push(cands[j]); pool.splice(pool.indexOf(cands[j]), 1)
    }
    return chosen.length ? withAttrs(seed, chosen) : seed
  }
  /** The appearance vector of a cell of this concept and variant, before any picture exists: its style and the attributes it asks for. */
  attrsAppearance(name, variant, seed) {
    const out = new Float64Array(this.model.da).fill(NaN); out.set(styleOnly(seed).subarray(AP_TRAITS.length, AP_BASE), AP_TRAITS.length)
    const at = this.facets.attrsOf(name, variant, seed, this.attrsActive()); out.set(at, AP_BASE); return out
  }
  node(k) { return this.nodes.get(k) }
  isDismissed(k) { return this.dismissed.has(k) }
  key(gx, gy) { return gx + ',' + gy }
  add(n) {
    this.nodes.set(n.k, n)
    const key = this.key(Math.floor(n.x / this.bucket), Math.floor(n.y / this.bucket))
    let l = this.grid.get(key); if (!l) this.grid.set(key, (l = [])); l.push(n)
  }

  /** Existing cells within `radius` of (x, y), nearest first. */
  nearby(x, y, radius) {
    const out = [], b = this.bucket, r2 = radius * radius
    const g0 = Math.floor((x - radius) / b), g1 = Math.floor((x + radius) / b), h0 = Math.floor((y - radius) / b), h1 = Math.floor((y + radius) / b)
    for (let gx = g0; gx <= g1; gx++) for (let gy = h0; gy <= h1; gy++) {
      const l = this.grid.get(this.key(gx, gy)); if (!l) continue
      for (const n of l) { const dx = n.x - x, dy = n.y - y; if (dx * dx + dy * dy <= r2) out.push(n) }
    }
    out.sort((p, q) => ((p.x - x) ** 2 + (p.y - y) ** 2) - ((q.x - x) ** 2 + (q.y - y) ** 2))
    return out
  }

  /** Makes sure every cell within `radius` of (cx, cy) exists, generating the missing ones frontier-first. A missing cell with no existing neighbour is left alone until one appears, so the world never jumps. Returns the cells created. */
  ensure(cx, cy, radius) {
    const last = this.lastEnsure
    if (last && Math.hypot(cx - last[0], cy - last[1]) < T.SPACING * 0.35 && radius <= last[2]) return []
    this.lastEnsure = [cx, cy, radius]
    const d = Math.hypot(cx, cy), c = T.SPACING / 1.9046
    const lo = Math.max(0, Math.trunc(((Math.max(d - radius, 0) / c) ** 2) - 0.5)), hi = Math.trunc(((d + radius) / c) ** 2 + 0.5)
    const px = [], py = [], ks = []
    for (let k = lo; k <= hi; k++) {
      if (this.nodes.has(k)) continue
      const x = Vogel.x(k), y = Vogel.y(k)
      if (Math.hypot(x - cx, y - cy) <= radius) { ks.push(k); px.push(x); py.push(y) }
    }
    const created = []; let remaining = ks.map((_, i) => i)
    while (remaining.length) {
      const next = []; let progressed = false
      for (const i of remaining) {
        if (this.nearby(px[i], py[i], T.NEIGHBOUR_R).length === 0) { next.push(i); continue }
        const n = this.generate(ks[i], px[i], py[i]); n.seed = this.withVariant(n.seed, this.atlas.nearestConcept(n.z)); this.add(n); created.push(n); progressed = true
      }
      if (!progressed) break
      remaining = next
    }
    return created
  }

  generate(k, x, y) {
    const { atlas, rng, dim } = this
    const nb = this.nearby(x, y, T.NEIGHBOUR_R).slice(0, T.GEN_NEIGHBOURS)
    // What is already around: how many cells of each concept, and how much one category dominates. A recommender that keeps serving the best option fills the screen
    // with it; the more one category dominates here, the more often something else is tried.
    const around = this.nearby(x, y, 3 * T.SPACING), conceptCount = new Map(), catCount = new Array(atlas.categoryNames.length).fill(0)
    for (const n of around) { const c = atlas.nearestConcept(n.z); conceptCount.set(c, (conceptCount.get(c) ?? 0) + 1); catCount[atlas.categoryOf(c)]++ }
    const topShare = around.length === 0 ? 0 : Math.max(...catCount) / around.length
    const boost = this.diversify ? Math.max(topShare - T.HOMOGENEITY_ABOVE, 0) * T.HOMOGENEITY_BOOST : 0
    if (this.priorConcepts.length && this.picks < T.PRIOR_HORIZON * 2 && rng.float() < T.PRIOR_JUMP_P) {
      const c = this.priorConcepts[rng.int(this.priorConcepts.length)]
      return { k, x, y, z: Float64Array.from({ length: dim }, (_, i) => atlas.coords[c][i] + 0.05 * rng.gauss()), seed: this.styledSeed(k) }
    }
    if (this.jumps && rng.float() < T.JUMP_P + T.JUMP_P_BORED * Math.min(this.dismissals, 10) + boost) return { k, x, y, z: this.jumpTarget(x, y), seed: this.styledSeed(k) }
    if (this.learn && this.model.events >= T.MIN_PICKS_TO_EXPLOIT && rng.float() < T.TASTE_JUMP_P) return { k, x, y, z: this.tasteTarget(conceptCount), seed: this.styledSeed(k) }
    const field = unit(this.flowField(x, y))                                 // the theme this part of the plane leans towards
    const exploit = this.learn && this.model.events >= T.MIN_PICKS_TO_EXPLOIT && rng.float() >= T.GEN_EXPLORE + boost       // before a few picks there is no taste to follow
    // Exploration cells follow the theme field fully; cells steered by the learned taste feel it only a little, or the field would pull them back and cancel what was learned.
    const pull = exploit ? T.FIELD_PULL * 0.25 : T.FIELD_PULL
    const base = Float64Array.from({ length: dim }, (_, i) => (1 - pull) * nb.reduce((s, n) => s + n.z[i], 0) / nb.length + pull * T.FIELD_NORM * field[i])
    if (exploit) {
      // Concept-level Thompson sampling: among the few concepts nearest to here, one is drawn with a probability that grows with how much the viewer is expected to like it
      // (under one plausible taste), less what is already common around here, and the new cell moves part of the way towards it.
      const ws = this.model.sample(), cands = atlas.nearestK(base, T.EXPLOIT_CANDIDATES)
      const scores = cands.map(c => { const u = this.model.utilityWith(ws, atlas.coords[c]) + 0.3 * this.model.utility(atlas.coords[c]); return this.diversify ? u - T.REPEAT_PENALTY * Math.log(1 + (conceptCount.get(c) ?? 0)) : u })
      let pick
      if (!this.diversify) pick = scores.indexOf(Math.max(...scores))
      else {
        const mx = Math.max(...scores), p = scores.map(s => Math.exp((s - mx) / T.EXPLOIT_TEMP))
        let r = rng.float() * p.reduce((a, b) => a + b, 0), i = 0; while (i < p.length - 1 && r > p[i]) { r -= p[i]; i++ } pick = i
      }
      const best = cands[pick], jitter = this.flowUnit(x, y)
      return { k, x, y, z: this.tidy(Float64Array.from({ length: dim }, (_, i) => base[i] + T.EXPLOIT_PULL * (atlas.coords[best][i] - base[i]) + T.GEN_STEP * 0.5 * jitter[i])), seed: this.styledSeed(k) }
    }
    const dir = new Float64Array(dim)                                         // exploration: no preference, only the flow (a Thompson sample when learning)
    if (this.learn) addInto(dir, unit(this.model.gradient(this.model.sample(), base)), 0.5)
    addInto(dir, this.flowUnit(x, y), 1)
    const step = unit(dir)
    return { k, x, y, z: this.tidy(Float64Array.from({ length: dim }, (_, i) => base[i] + T.GEN_STEP * step[i])), seed: this.styledSeed(k) }
  }

  /**
   * An island of something the person is expected to like, wherever it is on the concept map (the walk from cell to cell would take dozens of picks to get there): a concept drawn by a
   * Thompson sample of the learned taste among the best-liked ones, less what is already common around here. The sample (and the ranking of all concepts under it) is kept for a few dozen
   * cells and renewed as soon as something new is learned, so making a cell stays cheap.
   */
  tasteTarget(conceptCount) {
    const { atlas, rng, dim } = this
    if (!this.tasteRank || this.tasteRank.events !== this.model.events || this.tasteRank.uses >= T.TASTE_REUSE) {
      const ws = this.model.sample(), u = Array.from({ length: atlas.size }, (_, c) => this.model.utilityWith(ws, atlas.coords[c]) + 0.3 * this.model.utility(atlas.coords[c]))
      this.tasteRank = { events: this.model.events, uses: 0, top: u.map((v, c) => [v, c]).sort((a, b) => b[0] - a[0]).slice(0, T.TASTE_TOP) }
    }
    this.tasteRank.uses++
    const sc = this.tasteRank.top.map(([v, c]) => v - T.REPEAT_PENALTY * Math.log(1 + (conceptCount.get(c) ?? 0))), mx = Math.max(...sc), p = sc.map(v => Math.exp((v - mx) / T.TASTE_TEMP))
    let r = rng.float() * p.reduce((a, b) => a + b, 0), i = 0; while (i < p.length - 1 && r > p[i]) { r -= p[i]; i++ }
    const c = this.tasteRank.top[i][1]
    return Float64Array.from({ length: dim }, (_, d) => atlas.coords[c][d] + 0.05 * rng.gauss())
  }

  /** An island: a concept of the category that is rarest among the cells around (x, y), so over a few dozen jumps every category shows up. When learning, among a few candidates of that category the one the model likes best (plus noise) is taken. */
  jumpTarget(x, y) {
    const { atlas, rng, dim } = this
    const seen = new Array(atlas.categoryNames.length).fill(0)
    for (const n of this.nearby(x, y, 6 * T.SPACING)) seen[atlas.categoryOf(atlas.nearestConcept(n.z))]++
    const least = Math.min(...seen), cats = seen.map((s, i) => (s === least ? i : -1)).filter(i => i >= 0)
    const pool = atlas.conceptsIn(cats[rng.int(cats.length)])
    const candidates = [0, 1, 2].map(() => pool[rng.int(pool.length)])
    let best = candidates[0]
    if (this.learn) { let bs = -Infinity; for (const c of candidates) { const s = this.model.utility(atlas.coords[c]) + 0.6 * rng.gauss(); if (s > bs) { bs = s; best = c } } }
    return Float64Array.from({ length: dim }, (_, i) => atlas.coords[best][i] + 0.05 * rng.gauss())
  }

  /** Clamp the length, keep the point near the concept map (so the picture is a clear concept and not a vague blend) and round to what the engine sees. */
  tidy(z) {
    let s = 0; for (const v of z) s += v * v
    const n = Math.sqrt(s), f = n > T.Z_MAX ? T.Z_MAX / n : 1, out = Float64Array.from(z, v => v * f)
    const c = this.atlas.nearestConcept(out)
    if (this.atlas.distance(out, c) > T.SNAP_FROM) for (let i = 0; i < out.length; i++) out[i] += T.SNAP_PULL * (this.atlas.coords[c][i] - out[i])
    return Float64Array.from(out, v => Math.round(v * 100) / 100)
  }

  /**
   * A signal about cell k: it was favoured among the cells around it, with `weight` and of a `type` ('pick', 'view', 'save'). What the pictures look like is recorded too, for the
   * cells whose picture is known (apProvider). Paused learning only moves the focus.
   */
  signal(k, type, weight = 1) {
    const c = this.nodes.get(k); if (!c) return null
    this.flushDwell()
    if (!this.learning) return null
    const near = this.nearby(c.x, c.y, T.CHOICE_R)
    return this.model.observeChoice(near.map(n => n.z), near.findIndex(n => n.k === k), weight, false, { type, ap: near.map(n => this.appearance(n)) })
  }
  /** How a cell looks, as far as it is known: the style from its seed, the traits if its picture has been seen. */
  appearance(node) {
    const base = this.apProvider(node) ?? styleOnly(node.seed), f = this.facets, A = f ? f.A : 0, n = this.variantCount()
    if (!A) return base
    // [traits, style | the attributes the cell's kind asks for | the reader's words, if any]
    const out = new Float64Array(this.model.da).fill(NaN); out.set(base.subarray(0, AP_BASE))
    const name = this.atlas.names[this.atlas.nearestConcept(node.z)]; out.set(f.attrsOf(name, f.variantOf(node.seed, n), node.seed, this.attrsActive()), AP_BASE)
    const seen = this.seenProvider(node)          // the loop between the reader and the drawing: what the picture shows counts, not only what was asked for
    if (seen) for (let i = 0; i < seen.length && i < A; i++) out[AP_BASE + i] = seen[i]
    for (let j = AP_BASE; j < base.length && AP_BASE + A + (j - AP_BASE) < out.length; j++) out[AP_BASE + A + (j - AP_BASE)] = base[j]
    return out
  }

  /** The viewer settled on cell k: it was chosen among the cells around it. */
  pick(k, type = 'pick', weight = 1) {
    const c = this.nodes.get(k); if (!c) return
    this.signal(k, type, weight)
    this.picks++; this.focusK = k
    if (this.picks === T.PRIOR_HORIZON) { this.model.dropPriors(); this.priorConcepts = [] }
  }

  /** The viewer kept cell k (a heart): a strong signal. Un-saving it takes the signal back. */
  save(k) { return this.signal(k, 'save', T.SAVE_WEIGHT) }
  unsave(k) { const n = this.nodes.get(k); return n ? this.model.removeLast('save', n.z) : false }

  /** The viewer stayed anchored on cell k for ms (camera at rest, that cell in the centre). Collected until flushDwell. */
  dwell(k, ms) { if (ms < T.DWELL_MIN_MS || !this.nodes.has(k)) return; this.dwelled.set(k, (this.dwelled.get(k) ?? 0) + ms) }

  /** Turns what the viewer stayed on since the last call into ONE observation with soft labels: among the cells around, how long they stayed on each (logarithmically). */
  flushDwell() {
    if (this.dwelled.size === 0) return
    const longest = Math.max(...this.dwelled.values())
    const kept = [...this.dwelled].filter(e => e[1] * 2 >= longest).sort((a, b) => b[1] - a[1]).slice(0, T.DWELL_MAX_CELLS)
    // What a stay adds is the increase of ln(1 + total seconds on that cell): the tenth minute on the same cell is worth almost nothing.
    const gain = new Map(kept.map(([k, ms]) => { const t0 = (this.dwellTotal.get(k) ?? 0) / 1000; return [k, Math.log(1 + t0 + ms / 1000) - Math.log(1 + t0)] }))
    for (const [k, ms] of kept) this.dwellTotal.set(k, (this.dwellTotal.get(k) ?? 0) + ms)
    const cx = kept.reduce((s, [k]) => s + this.nodes.get(k).x, 0) / kept.length, cy = kept.reduce((s, [k]) => s + this.nodes.get(k).y, 0) / kept.length
    const near = new Map(); for (const n of this.nearby(cx, cy, T.CHOICE_R)) near.set(n.k, n); for (const [k] of kept) near.set(k, this.nodes.get(k))
    const shown = [...near.values()], targets = shown.map(n => gain.get(n.k) ?? 0)
    const sum = [...gain.values()].reduce((a, b) => a + b, 0)
    const w = Math.min(Math.max(T.DWELL_WEIGHT * sum / Math.log(1 + T.DWELL_FULL_S), 0), T.DWELL_WEIGHT)
    if (w > 1e-4 && this.learning) this.model.observeSoft(shown.map(n => n.z), targets, w, false, { type: 'dwell', z: this.nodes.get(kept[0][0]).z, ap: shown.map(n => this.appearance(n)) })
    this.dwelled.clear()
  }

  /** Starts a viewer from their group's typical taste instead of from nothing: islands of the group's concepts for the first few picks, and optionally soft picks in the model. Both are forgotten after PRIOR_HORIZON real picks. */
  applyPrior(concepts, strength = T.PRIOR_STRENGTH, islands = true) {
    if (islands) this.priorConcepts = concepts
    if (strength > 0) for (const c of concepts) {
      const others = Array.from({ length: 5 }, () => this.atlas.coords[this.rng.int(this.atlas.size)])
      this.model.observeChoice([this.atlas.coords[c], ...others], 0, strength, true)
    }
  }

  /** "Not for me": the cell stays where it is (the world never rewrites), but the model learns it is worse than the focus. */
  dismiss(k, reference = this.focusK) {
    const bad = this.nodes.get(k); if (!bad) return
    const ref = this.nodes.get(reference) ?? this.focus
    if (k === reference || this.dismissed.has(k)) return
    this.dismissed.add(k); if (this.learning) this.model.observeReject(bad.z, ref.z, { ap: [this.appearance(ref), this.appearance(bad)] })
  }

  /** What the model has understood the viewer likes: for every category, how much better than average the model rates its concepts (0 = indifferent). */
  taste() {
    const u = Array.from({ length: this.atlas.size }, (_, i) => this.model.utility(this.atlas.coords[i])), mean = u.reduce((a, b) => a + b, 0) / u.length
    const out = {}
    this.atlas.categoryNames.forEach((name, c) => { const cs = this.atlas.conceptsIn(c); out[name] = cs.reduce((s, i) => s + u[i] - mean, 0) / cs.length })
    return out
  }

  flowField(x, y) {
    const wl = T.FLOW_WAVELENGTH
    return Float64Array.from({ length: this.dim }, (_, i) => {
      let a = 0
      for (let m = 0; m < 3; m++) { const f = (1 + 0.6 * m) * 2 * Math.PI / wl; a += Math.sin(f * (this.flowK[m][i][0] * x + this.flowK[m][i][1] * y) + this.flowPhase[m][i]) / (1 + 0.6 * m) }
      return a
    })
  }
  flowUnit(x, y) {          // a little jitter on top, so neighbouring cells are not identical
    const j = unit(Float64Array.from({ length: this.dim }, () => this.rng.gauss())), u = unit(this.flowField(x, y))
    return unit(Float64Array.from({ length: this.dim }, (_, i) => u[i] + 0.25 * j[i]))
  }
}

function addInto(into, v, w) { for (let i = 0; i < into.length; i++) into[i] += w * v[i] }
function unit(x) { let s = 0; for (const v of x) s += v * v; const n = Math.sqrt(s); return n < 1e-6 ? new Float64Array(x.length) : Float64Array.from(x, v => v / n) }
