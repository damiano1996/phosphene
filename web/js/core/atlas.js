// @ts-check
const SIGMA = 0.45, MAX_SECOND = 2.2

/** The colours of the app icon, from its warm centre to its cool rim: what a cell shows until its picture arrives. */
const RAMP = ['#FFD6A0', '#FFB163', '#FA8E67', '#F66F76', '#F25184', '#E14299', '#C944AE', '#A646CF', '#8349EF', '#784AFA'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
const rampColor = t => { const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(x), f = x - i; return RAMP[i].map((v, c) => v + (RAMP[i + 1][c] - v) * f) }

/** Where each concept sits along the map's main direction of variation, as a rank from 0 to 1: related concepts get nearby colours and the whole ramp is used. */
function rampPositions(coords) {
  const n = coords.length, d = coords[0].length, mean = new Float64Array(d)
  for (const c of coords) for (let i = 0; i < d; i++) mean[i] += c[i] / n
  let v = Float64Array.from({ length: d }, (_, i) => 1 + i * 0.1)
  for (let it = 0; it < 40; it++) {       // power iteration on the covariance
    const w = new Float64Array(d)
    for (const c of coords) { let p = 0; for (let i = 0; i < d; i++) p += (c[i] - mean[i]) * v[i]; for (let i = 0; i < d; i++) w[i] += p * (c[i] - mean[i]) }
    const nrm = Math.hypot(...w) || 1; v = w.map(x => x / nrm)
  }
  const proj = coords.map(c => { let p = 0; for (let i = 0; i < d; i++) p += (c[i] - mean[i]) * v[i]; return p })
  const order = proj.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), t = new Float64Array(n)
  order.forEach(([, i], r) => { t[i] = n > 1 ? r / (n - 1) : 0.5 })
  return t
}

/**
 * The concept map shared with the engine (atlas/atlas.tsv): every concept has a category, a representative colour and a position in a 12-D space where related
 * concepts are close. A cell's latent is a point of this space; the engine draws the nearest concept (and the second one only when it is about as close).
 * `version` must equal the engine's: the engine refuses a request made against another atlas.
 */
export class Atlas {
  /**
   * @param {number} version @param {number} dim @param {string[]} categories @param {string[]} names
   * @param {number[][]} colors  [r, g, b] per concept (the colour of the concept's pictures, kept for the file format) @param {Float64Array[]} coords @param {Float64Array} [rampT]
   */
  constructor(version, dim, categories, names, colors, coords, rampT) {
    this.version = version; this.dim = dim; this.categories = categories; this.names = names; this.colors = colors; this.coords = coords
    this.categoryNames = [...new Set(categories)]
    this.categoryIndex = categories.map(c => this.categoryNames.indexOf(c))
    this.rampT = rampT ?? rampPositions(coords)
  }
  get size() { return this.names.length }

  /** The same map without some categories (the person chose not to see them). The version stays the engine's: hiding only keeps the world from steering towards them. */
  without(hidden) {
    const keep = []; for (let i = 0; i < this.size; i++) if (!hidden.has(this.categories[i])) keep.push(i)
    return new Atlas(this.version, this.dim, keep.map(i => this.categories[i]), keep.map(i => this.names[i]), keep.map(i => this.colors[i]), keep.map(i => this.coords[i]), Float64Array.from(keep.map(i => this.rampT[i])))
  }
  categoryOf(concept) { return this.categoryIndex[concept] }
  conceptsIn(category) { const out = []; for (let i = 0; i < this.size; i++) if (this.categoryIndex[i] === category) out.push(i); return out }
  categoryId(name) { return this.categoryNames.indexOf(name) }
  distance(z, concept) { let s = 0; const c = this.coords[concept]; for (let i = 0; i < z.length; i++) { const d = z[i] - c[i]; s += d * d } return Math.sqrt(s) }

  /** The nearest concept and the second nearest. */
  nearestTwo(z) {
    let a = -1, b = -1, da = Infinity, db = Infinity
    for (let i = 0; i < this.size; i++) { const d = this.distance(z, i); if (d < da) { b = a; db = da; a = i; da = d } else if (d < db) { b = i; db = d } }
    return [a, b]
  }
  /** What the engine will draw: the nearest concept, plus the second when it is about as close. Returns [[concept, weight], ...]. (Must match engine/atlas.py.) */
  pick(z) {
    const [a, b] = this.nearestTwo(z); const da = this.distance(z, a), db = this.distance(z, b)
    const w2 = db < MAX_SECOND ? Math.exp(-(db * db - da * da) / (2 * SIGMA * SIGMA)) : 0
    return w2 < 0.12 ? [[a, 1]] : [[a, 1 / (1 + w2)], [b, w2 / (1 + w2)]]
  }
  /** The k concepts nearest to z, nearest first. */
  nearestK(z, k) { return Array.from({ length: this.size }, (_, i) => [this.distance(z, i), i]).sort((p, q) => p[0] - q[0]).slice(0, k).map(p => p[1]) }
  nearestConcept(z) { return this.nearestTwo(z)[0] }
  /** [r, g, b] for a cell until its picture arrives: a colour of the app icon's palette, chosen by where the concept sits on the map. */
  placeholder(z) {
    let r = 0, g = 0, b = 0
    for (const [c, w] of this.pick(z)) { const col = rampColor(this.rampT[c]); r += w * col[0]; g += w * col[1]; b += w * col[2] }
    return [Math.round(r), Math.round(g), Math.round(b)]
  }

  /** @param {string} text the contents of atlas.tsv */
  static parse(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '')
    const head = lines[0].split('\t'), dim = parseInt(head[2])
    const cats = [], names = [], colors = [], coords = []
    for (const l of lines.slice(1)) {
      const p = l.split('\t'); cats.push(p[0]); names.push(p[1]); colors.push([+p[2], +p[3], +p[4]])
      coords.push(Float64Array.from({ length: dim }, (_, i) => parseFloat(p[5 + i])))
    }
    return new Atlas(parseInt(head[1]), dim, cats, names, colors, coords)
  }
}
