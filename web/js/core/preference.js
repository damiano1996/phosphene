// @ts-check
import { T } from './tuning.js'
import { Rng } from './rng.js'
import { AP_BASE } from './appearance.js'

let counter = 0
const r3 = v => Math.round(v * 1000) / 1000

/**
 * Preferential Bayesian model of "how much does this user like point z of the latent space": utility(z) = w . phi(z), phi = [z, random Fourier features] (a GP with linear + RBF
 * kernel), w ~ N(0, prior^2) a priori. Every signal is a choice ("this point was favoured among these shown points": a softmax likelihood); a rejection is a two-way choice. The
 * posterior is a diagonal Laplace approximation, refit from the observations. sample() draws a utility function from it (Thompson sampling).
 *
 * It is a SLIDING-WINDOW Thompson sampler, so that it follows a taste that changes: only the last `window` observations are kept; inside the window each one counts for less the more
 * recent ones came after it (`rankDecay` per observation) and for less the older it is (a half-life of `halfLifeDays`). Both are applied when fitting, to the stored base weight,
 * never in place: that is what makes it safe to save the observations, reload them and fit again.
 *
 * The random features are fixed (FEATURE_SEED), the same on every launch, so that observations mean the same thing next time. Only `sample()` draws from the world's own seed.
 * What is saved are the observations (what was shown, what was favoured, when, how strongly), never the fitted weights.
 */
export class PreferenceModel {
  /** @param {number} seed for sampling @param {number} dim @param {{window?: number, halfLifeDays?: number, rankDecay?: number, clock?: () => number, tags?: number}} [opt] `tags`: how many words the reader of pictures has; `attrs`: how many attributes the finer kinds of a concept carry (the block before the reader's words) */
  constructor(seed, dim, opt = {}) {
    this.rng = new Rng(seed); this.dim = dim; this.f = T.RFF; this.nz = dim + this.f; this.tags = opt.tags ?? 0; this.attrs = opt.attrs ?? 0; this.da = AP_BASE + this.attrs + this.tags; this.nf = this.nz + this.da          // [z | random Fourier features | how the pictures look | words about them]
    this.window = opt.window ?? T.WINDOW; this.halfLifeMs = (opt.halfLifeDays ?? T.HALF_LIFE_DAYS) * 864e5; this.rankDecay = opt.rankDecay ?? T.RANK_DECAY
    this.clock = opt.clock ?? (() => Date.now())
    const frng = new Rng(T.FEATURE_SEED)
    this.omega = Array.from({ length: this.f }, () => Float64Array.from({ length: dim }, () => frng.gauss() / T.LENGTHSCALE))
    this.phase = Float64Array.from({ length: this.f }, () => frng.float() * 2 * Math.PI)
    this.scale = Math.sqrt(2 / this.f)
    /** @type {{id: string, type: string, t: number, z: Float64Array|null, weight: number, prior: boolean, shown: Float64Array[], phi: Float64Array[], ap: (Float64Array|null)[], target: number[]}[]} */ this.history = []
    // What a picture shows (the map) has the most room to explain a choice. How it looks (colour, light, composition, style) is measured on the picture and goes with what it shows (a sea is blue):
    // given the same room it would take the credit and leave the map with little to learn, so it has less. The attributes asked for in the seed are what the recommender chooses, and keep theirs.
    this.priorStd = Float64Array.from({ length: this.nf }, (_, i) => (i < dim ? T.LINEAR_PRIOR_STD : i < this.nz ? T.PRIOR_STD : i < this.nz + AP_BASE ? T.AP_PRIOR_STD : i < this.nz + AP_BASE + this.attrs ? T.PRIOR_STD : T.AP_TAG_STD))
    this.apMean = new Float64Array(this.da); this.apStd = new Float64Array(this.da).fill(1)
    this.mu = new Float64Array(this.nf); this.sigma = Float64Array.from(this.priorStd)
    /** called after every change to the observations (to save them) */ this.onChange = () => { }
  }
  get events() { return this.history.length }

  /** The features of a point of the map alone (the appearance block is zero: nothing is known about how it will look). */
  features(z) {
    return Float64Array.from({ length: this.nf }, (_, j) => {
      if (j >= this.nz) return 0
      if (j < this.dim) return z[j]
      const k = j - this.dim; let a = this.phase[k]
      for (let i = 0; i < this.dim; i++) a += this.omega[k][i] * z[i]
      return this.scale * Math.cos(a)
    })
  }
  utility(z) { return dot(this.mu, this.features(z)) }
  /** The appearance of a picture, standardised over the observations (a trait not measured counts as average). */
  apStandard(a) { return Float64Array.from({ length: this.da }, (_, i) => (a && Number.isFinite(a[i]) ? (a[i] - this.apMean[i]) / this.apStd[i] : 0)) }
  /** The utility of how a picture looks (and which style drew it), apart from what it shows. */
  appearanceUtility(a) { const s = this.apStandard(a); let u = 0; for (let i = 0; i < this.da; i++) u += this.mu[this.nz + i] * s[i]; return u }
  utilityWith(w, z) { return dot(w, this.features(z)) }
  /** What attribute slot i is worth under a weight vector: its weight, for a picture that has it (standardised like the rest of the look). */
  attrUtilityWith(w, i) { const k = AP_BASE + i; return w[this.nz + k] * (1 - this.apMean[k]) / this.apStd[k] }
  /** The same under the fitted weights: how much the model likes this attribute so far. */
  attrMean(i) { return this.attrUtilityWith(this.mu, i) }
  /** The same for how a picture looks, under a drawn weight vector (Thompson sampling of a finer kind of a concept). */
  appearanceUtilityWith(w, a) { const s = this.apStandard(a); let u = 0; for (let i = 0; i < this.da; i++) u += w[this.nz + i] * s[i]; return u }
  /** Forgets the observations that came from a group prior: they only exist to start a viewer who has done nothing yet. */
  dropPriors() { const n = this.history.length; this.history = this.history.filter(e => !e.prior); if (this.history.length !== n) this.fit() }
  observeChoice(shown, chosen, weight = 1, prior = false, meta = {}) { return this.observeSoft(shown, shown.map((_, i) => (i === chosen ? 1 : 0)), weight, prior, { z: shown[chosen], ...meta }) }
  /**
   * Like observeChoice but with soft labels: targets says how much each option was favoured (normalised to sum to 1).
   * @param {{type?: string, t?: number, z?: ArrayLike<number>|null, ap?: (ArrayLike<number>|null)[]}} [meta] type of signal ('pick', 'view', 'save', 'dwell', 'dismiss'), when, the point it is about, and how each shown picture looks (null where unknown)
   * @returns {string|null} the id of the observation
   */
  observeSoft(shown, targets, weight, prior = false, meta = {}) {
    const total = targets.reduce((a, b) => a + b, 0); if (total <= 0) return null
    const id = `${(meta.t ?? this.clock()).toString(36)}${(counter++).toString(36)}`
    this.history.push({ id, type: meta.type ?? 'pick', t: meta.t ?? this.clock(), z: meta.z ? Float64Array.from(meta.z) : null, weight, prior,
      shown: shown.map(z => Float64Array.from(z)), phi: shown.map(z => this.features(z)), ap: shown.map((_, i) => (meta.ap && meta.ap[i] ? Float64Array.from(meta.ap[i]) : null)), target: targets.map(x => x / total) })
    let real = this.history.filter(e => !e.prior).length
    while (real > this.window) { const i = this.history.findIndex(e => !e.prior); this.history.splice(i, 1); real-- }          // the window slides
    this.fit(); this.onChange(); return id
  }
  /** `rejected` is worse than `reference`. */
  observeReject(rejected, reference, meta = {}) { return this.observeChoice([reference, rejected], 0, T.DISMISS_WEIGHT, false, { type: 'dismiss', z: rejected, ...meta }) }

  /** Takes one observation out (the person asked to forget it, or undid it) and fits again. */
  remove(id) { const n = this.history.length; this.history = this.history.filter(e => e.id !== id); if (this.history.length !== n) { this.fit(); this.onChange(); return true } return false }
  /** Takes out the latest observation of `type` about a point near z (an un-saved picture is not a dislike: it is as if it had never been saved). */
  removeLast(type, z) {
    for (let i = this.history.length - 1; i >= 0; i--) { const e = this.history[i]; if (e.type === type && e.z && e.z.length === z.length && e.z.every((v, q) => Math.abs(v - z[q]) < 0.011)) return this.remove(e.id) }
    return false
  }
  /** Forgets everything. */
  clear() { this.history = []; this.mu = new Float64Array(this.nf); this.sigma = Float64Array.from(this.priorStd); this.onChange() }

  /** The signals, newest first, as plain objects (what the "what it learned" screen shows). Group-prior observations are not signals. */
  signals() { return this.history.filter(e => !e.prior).map(e => ({ id: e.id, type: e.type, t: e.t, weight: e.weight, z: e.z })).reverse() }
  /** The observations as JSON: what was shown, favoured, when and how strongly (never the fitted weights). Group priors are not saved. */
  toJSON() { return { v: 1, layout: 3, attrs: this.attrs, window: this.window, events: this.history.filter(e => !e.prior).map(e => ({ id: e.id, type: e.type, t: e.t, w: e.weight, z: e.z && Array.from(e.z, r3), s: e.shown.map(z => Array.from(z, r3)), a: e.ap.map(a => a && Array.from(a, v => (Number.isFinite(v) ? r3(v) : null))), g: e.target.map(r3) })) } }
  /** A saved look (traits, style | attribute slots | reader's words) moved to this model's number of attribute slots: the ones that exist in both are kept, new ones are unknown. */
  realign(a, fromAttrs) {
    if (fromAttrs === this.attrs || a.length < AP_BASE) return a
    const keep = Math.min(fromAttrs, this.attrs), head = Math.min(a.length, AP_BASE + fromAttrs), tail = a.length > AP_BASE + fromAttrs ? a.subarray(AP_BASE + fromAttrs) : new Float64Array(0)
    const out = new Float64Array(AP_BASE + this.attrs + tail.length).fill(NaN)
    out.set(a.subarray(0, Math.min(AP_BASE + keep, head))); out.set(tail, AP_BASE + this.attrs)
    return out
  }
  /** Loads observations saved by toJSON and fits once. Anything not of this format is ignored. */
  restore(json) {
    if (!json || json.v !== 1 || !Array.isArray(json.events)) return 0
    const fromAttrs = json.layout === 3 ? (json.attrs ?? 0) : json.layout === 2 ? 30 : 0          // how many slots of attributes the saved looks have (layout 1: none; layout 2: the first 30)
    const keep = json.events.filter(e => Array.isArray(e.s) && e.s.length && e.s[0].length === this.dim).slice(-this.window)
    this.history = this.history.filter(e => e.prior).concat(keep.map(e => ({ id: e.id, type: e.type, t: e.t, z: e.z ? Float64Array.from(e.z) : null, weight: e.w, prior: false,
      shown: e.s.map(z => Float64Array.from(z)), phi: e.s.map(z => this.features(z)), ap: (e.a ?? e.s.map(() => null)).map(a => a && this.realign(Float64Array.from(a, v => (v == null ? NaN : v)), fromAttrs)), target: e.g })))
    this.fit(60); return keep.length
  }

  mean() { return Float64Array.from(this.mu) }
  /** Thompson sample: a utility function drawn from the posterior, as a weight vector. */
  sample() { return Float64Array.from({ length: this.nf }, (_, i) => this.mu[i] + this.sigma[i] * this.rng.gauss()) }
  /** Gradient of the utility with weights w at z. */
  gradient(w, z) {
    const g = Float64Array.from({ length: this.dim }, (_, i) => w[i])
    for (let j = 0; j < this.f; j++) {
      let a = this.phase[j]; for (let i = 0; i < this.dim; i++) a += this.omega[j][i] * z[i]
      const c = -this.scale * Math.sin(a) * w[this.dim + j]
      for (let i = 0; i < this.dim; i++) g[i] += c * this.omega[j][i]
    }
    return g
  }

  /** How much each observation counts now: its base weight, less for every newer observation in the window and for its age. A group prior counts as it is. */
  effectiveWeights(now = this.clock()) {
    const real = this.history.filter(e => !e.prior).length; let seen = 0
    return this.history.map(e => {
      if (e.prior) return e.weight
      const rank = real - 1 - seen++; return e.weight * Math.pow(this.rankDecay, rank) * Math.pow(0.5, Math.max(0, now - e.t) / this.halfLifeMs)
    })
  }

  /** The mean and spread of every trait over what has been shown, so that a weight means "per typical step of this trait". The style slots are used as they are. */
  standardiseAppearance() {
    for (let i = 0; i < this.da; i++) {
      let n = 0, m = 0, v = 0
      for (const e of this.history) for (const a of e.ap) if (a && Number.isFinite(a[i])) { n++; const d = a[i] - m; m += d / n; v += d * (a[i] - m) }
      this.apMean[i] = n > 1 ? m : 0; this.apStd[i] = n > 1 ? Math.max(Math.sqrt(v / n), 1e-3) : 1
    }
  }

  fit(iters = T.FIT_ITERS) {
    const nf = this.nf, prec0 = Float64Array.from(this.priorStd, s => 1 / (s * s)), grad = new Float64Array(nf), hess = new Float64Array(nf), mu = this.mu
    const w = this.effectiveWeights()
    this.standardiseAppearance()
    const phis = this.history.map(e => e.phi.map((fz, k) => { const f = Float64Array.from(fz), a = this.apStandard(e.ap[k]); for (let i = 0; i < this.da; i++) f[this.nz + i] = a[i]; return f }))
    // The penalised log-likelihood of the observations (soft labels), to accept only steps that improve it: the Newton step below treats the features as independent, and they are
    // not (the Fourier features overlap), so a full step can overshoot, and with many observations it would diverge.
    const objective = m => {
      let L = 0; for (let j = 0; j < nf; j++) L -= 0.5 * prec0[j] * m[j] * m[j]
      this.history.forEach((e, q) => {
        const sc = phis[q].map(ph => dot(m, ph)), mx = Math.max(...sc); let z = 0; for (const v of sc) z += Math.exp(v - mx)
        const lz = mx + Math.log(z); let ll = 0; for (let k = 0; k < sc.length; k++) ll += e.target[k] * (sc[k] - lz); L += w[q] * ll
      })
      return L
    }
    let cur = objective(mu)
    for (let it = 0; it < iters; it++) {
      for (let j = 0; j < nf; j++) { grad[j] = -prec0[j] * mu[j]; hess[j] = prec0[j] }
      this.history.forEach((e, q) => {
        const phi = phis[q], n = phi.length, p = softmax(phi.map(ph => dot(mu, ph)))
        for (let j = 0; j < nf; j++) {
          let m1 = 0, m2 = 0, tj = 0
          for (let k = 0; k < n; k++) { const x = phi[k][j]; m1 += p[k] * x; m2 += p[k] * x * x; tj += e.target[k] * x }
          grad[j] += w[q] * (tj - m1); hess[j] += w[q] * (m2 - m1 * m1)
        }
      })
      const d = Float64Array.from(grad, (g, j) => g / hess[j]); let step = 0.8, moved = false
      for (let tries = 0; tries < 8; tries++, step /= 2) {
        const cand = Float64Array.from(mu, (v, j) => v + step * d[j]), val = objective(cand)
        if (val >= cur - 1e-9) { mu.set(cand); cur = val; moved = true; break }
      }
      if (!moved) break
    }
    const h2 = Float64Array.from(prec0)                                       // posterior variance from the final diagonal Hessian
    this.history.forEach((e, q) => {
      const phi = phis[q], n = phi.length, p = softmax(phi.map(ph => dot(mu, ph)))
      for (let j = 0; j < nf; j++) { let m1 = 0, m2 = 0; for (let k = 0; k < n; k++) { const x = phi[k][j]; m1 += p[k] * x; m2 += p[k] * x * x } h2[j] += w[q] * (m2 - m1 * m1) }
    })
    this.sigma = Float64Array.from(h2, v => 1 / Math.sqrt(v))
  }
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
function softmax(p) { const mx = Math.max(...p); const e = p.map(v => Math.exp(v - mx)); const z = e.reduce((a, b) => a + b, 0); return e.map(v => v / z) }
