import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Facets, attrsOfSeed, withAttrs, CAPACITY } from '../js/core/facets.js'
import { PreferenceModel } from '../js/core/preference.js'
import { AP_BASE } from '../js/core/appearance.js'
import { SpiralWorld } from '../js/core/spiral.js'
import { atlas } from './helpers.js'

const facets = Facets.parse(readFileSync(new URL('../../atlas/facets.json', import.meta.url), 'utf8'))

// The layout of a seed is written in core/facets.js; engine/tests/test_seed_layout.py decodes the same seeds to the same values.
const SEEDS = [
  { seed: 0, style: 0, variant: 0, attrs: [] },
  { seed: 0b101 | (3 << 6) | (6 << 8) | (30 << 17), style: 5, variant: 3, attrs: [5, 29] },
  { seed: (1 << 6) | (96 << 8), style: 0, variant: 1, attrs: [95] },
  { seed: (2 << 6) | (1 << 17) | (7 << 26), style: 0, variant: 2, attrs: [0] },
]
test('a seed is read the way the layout says', () => {
  for (const { seed, variant, attrs } of SEEDS) {
    assert.equal(facets.variantOf(seed, 4), variant); assert.deepEqual(attrsOfSeed(seed), attrs)
    assert.equal(seed % 8, seed & 7)
  }
})
test('writing attributes into a seed keeps its style and variant, and reads back', () => {
  const s = 0b110 | (2 << 6) | (31 << 26), w = withAttrs(s, [10, 40])
  assert.deepEqual(attrsOfSeed(w), [10, 40]); assert.equal(w & 7, 6); assert.equal(facets.variantOf(w, 4), 2); assert.equal(w >>> 26, 31)
  assert.deepEqual(attrsOfSeed(withAttrs(w, [])), []); assert.deepEqual(attrsOfSeed(withAttrs(w, [3])), [3])
  assert.ok(withAttrs(0x7fffffff, [95, 94]) >= 0, 'stays a positive 31 bit number')
})
test('the first attributes of the registry are those of facets.json, and slots exist for more', () => {
  assert.equal(facets.A, CAPACITY); assert.ok(facets.attrs.length >= 30 && facets.attrs.length <= CAPACITY)
  const v = facets.attrsOf('snowy mountains', 1, withAttrs(0, [facets.index.get('fog')])); assert.equal(v.length, CAPACITY)
  assert.equal(v[facets.index.get('fog')], 1); assert.equal(v[facets.index.get('pale-rock')], 1)
  assert.equal(facets.attrsOf('a pizza', 0, withAttrs(0, [3]), false)[3], 0, 'a model that cannot make attributes is not asked for them')
})
test('terrain and season attributes are for nature; light, palette and composition fit anything', () => {
  const i = id => facets.index.get(id)
  assert.ok(facets.fits(i('snow'), 'landscapes')); assert.ok(!facets.fits(i('snow'), 'food and drink')); assert.ok(!facets.fits(i('autumn'), 'cars and trucks'))
  assert.ok(facets.fits(i('golden-hour'), 'food and drink')); assert.ok(facets.fits(i('close-up'), 'cars and trucks'))
})
test('looks saved with fewer slots of attributes are realigned, not dropped', () => {
  const m = new PreferenceModel(1, atlas.dim, { attrs: CAPACITY, tags: 2 })
  const old = Float64Array.from({ length: AP_BASE + 30 + 2 }, (_, i) => i + 1)               // layout 2: 30 slots, then 2 words
  const a = m.realign(old, 30)
  assert.equal(a.length, AP_BASE + CAPACITY + 2)
  assert.equal(a[AP_BASE + 29], old[AP_BASE + 29]); assert.ok(Number.isNaN(a[AP_BASE + 30])); assert.equal(a[AP_BASE + CAPACITY], old[AP_BASE + 30]); assert.equal(a[AP_BASE + CAPACITY + 1], old[AP_BASE + 31])
  const first = m.realign(Float64Array.from({ length: AP_BASE + 2 }, (_, i) => i + 1), 0)          // layout 1: no slots
  assert.equal(first.length, AP_BASE + CAPACITY + 2); assert.equal(first[AP_BASE + CAPACITY], AP_BASE + 1)
})
test('a world with attributes on asks for attributes only where they fit, and never more than two', () => {
  const w = new SpiralWorld(9, atlas, { facets }); w.variantCount = () => 4; w.attrsActive = () => true; w.ensure(0, 0, 2500)
  let some = 0, bad = 0
  for (const n of w.all) {
    const ids = attrsOfSeed(n.seed); assert.ok(ids.length <= 2); if (ids.length) some++
    const cat = atlas.categories[atlas.nearestConcept(n.z)]; for (const i of ids) if (!facets.fits(i, cat)) bad++
  }
  assert.ok(some > 20, 'some cells ask for attributes'); assert.equal(bad, 0)
  const off = new SpiralWorld(9, atlas, { facets }); off.variantCount = () => 4; off.ensure(0, 0, 2500)
  for (const n of off.all) assert.deepEqual(attrsOfSeed(n.seed), [], 'a model that cannot make attributes is never asked for them')
})
