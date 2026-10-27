// @ts-check
/**
 * The finer grain below a concept (atlas/facets.json and the engine's registry of attributes): "snowy mountains" is also the Dolomites at sunrise, dark granite peaks, green alpine
 * meadows (a variant of the concept), and any cell can ask for one or two attributes on top ("pale limestone rock", "golden hour light", "fog"). The attributes are the same words for
 * every concept, which is what lets a liking learned on one concept carry to another.
 *
 * THE LAYOUT OF A SEED (engine/src/phosphene_engine/atlas.py reads it the same way; web/test/facets.test.js and engine/tests/test_seed_layout.py check both against the same values):
 *   bits 0-2    which of the 8 slots of STYLE_BY_SEED (photo, close-up photo, painting)
 *   bits 3-5    unused by the picture's content (they only choose among the slots of a style)
 *   bits 6-7    the variant: a finer kind of the concept, 0 is the plain concept
 *   bits 8-16   the first attribute asked for, plus one (0: none), an id of the registry
 *   bits 17-25  the second attribute asked for, plus one (0: none)
 *   bits 26-30  free; every bit still goes into the noise, so two cells never look the same
 * Only models that make the prompts of attributes as they are asked for (the engine says so: /health "attrs") read the attribute bits; the others draw the concept (and its variant) only.
 */
export const VARIANT_SHIFT = 6, ATTR1_SHIFT = 8, ATTR2_SHIFT = 17, ATTR_MASK = 0x1FF
/** How many attribute slots the model has until the engine says otherwise (it does: /attrs "capacity", the engine's own limit). */
export const CAPACITY = 96

/** @param {number} seed @returns {number[]} the ids of the attributes a seed asks for (0, 1 or 2) */
export function attrsOfSeed(seed) { return [(seed >>> ATTR1_SHIFT) & ATTR_MASK, (seed >>> ATTR2_SHIFT) & ATTR_MASK].filter(a => a > 0).map(a => a - 1) }
/** @param {number} seed @param {number[]} ids at most two @returns {number} the seed asking for exactly these attributes */
export function withAttrs(seed, ids) {
  const a = (ids[0] ?? -1) + 1, b = (ids[1] ?? -1) + 1
  return ((seed & ~((ATTR_MASK << ATTR1_SHIFT) | (ATTR_MASK << ATTR2_SHIFT))) | (a << ATTR1_SHIFT) | (b << ATTR2_SHIFT)) & 0x7fffffff
}

export class Facets {
  /** @param {{variants: number, version: number, attributes: {id: string, label: string, group: string, phrase?: string}[], nature?: string[], curated: Record<string, {phrase: string, attrs: string[]}[]>, generic: {phrase: string, attrs: string[]}[]}} j */
  constructor(j) {
    this.variants = j.variants; this.version = j.version; this.curated = j.curated; this.generic = j.generic; this.nature = new Set(j.nature ?? [])
    /** the registry of attributes (the engine's is the master: setAttrs replaces this with it) */ this.attrs = j.attributes; this.capacity = CAPACITY
    this.reindex()
  }
  reindex() { this.index = new Map(this.attrs.map((a, i) => [a.id, i])) }
  /** Replaces the list of attributes by the engine's (which has the ones discovered since; the first ones are the same, in the same order). */
  setAttrs(list, nature, capacity) { this.attrs = list; if (nature) this.nature = new Set(nature); if (capacity) this.capacity = capacity; this.reindex() }
  /** @param {string} text */
  static parse(text) { return new Facets(JSON.parse(text)) }
  /** The size of the attribute block of the model: slots, not attributes, so that a new attribute needs no new dimension. */
  get A() { return this.capacity }
  /** Which variant a seed draws, on a model that draws `n` kinds of every concept (1: only the plain concept). */
  variantOf(seed, n) { return n > 1 ? ((seed >>> VARIANT_SHIFT) & 3) % n : 0 }
  /** The seed with its variant set to v (on a model that draws `n` kinds). */
  withVariant(seed, v, n) { return n > 1 ? ((seed & ~(3 << VARIANT_SHIFT)) | ((v % n) << VARIANT_SHIFT)) : seed }
  /** The kind itself: its phrase and attribute ids; null for the plain concept. */
  kind(name, variant) {
    if (variant <= 0) return null
    const own = this.curated[name]; if (own) return own[variant - 1] ?? null
    const g = this.generic[variant - 1]; return g ? { phrase: `${name} ${g.phrase}`, attrs: g.attrs } : null
  }
  /** Whether an attribute makes sense for a concept of this category: terrain and season only in nature, light, palette and composition anywhere. */
  fits(attrIndex, category) { const g = this.attrs[attrIndex]?.group; return !(g === 'terrain' || g === 'season') || this.nature.size === 0 || this.nature.has(category) }
  /** 1 for each slot of an attribute the cell asks for: those of its variant, and those written in its seed (the vector has `capacity` slots). */
  attrsOf(name, variant, seed = 0, attrsOn = true) {
    const out = new Float64Array(this.capacity), k = this.kind(name, variant)
    if (k) for (const id of k.attrs) { const i = this.index.get(id); if (i !== undefined && i < this.capacity) out[i] = 1 }
    if (attrsOn) for (const i of attrsOfSeed(seed)) if (i < this.capacity) out[i] = 1
    return out
  }
}
