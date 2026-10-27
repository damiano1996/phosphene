import test from 'node:test'
import assert from 'node:assert/strict'
import { discover } from '../js/core/discover.js'
import { Rng } from '../js/core/rng.js'

const words = [{ attr: 0 }, { attr: null }, { attr: null }, { attr: null }, { attr: null }]    // word 0 is an attribute already; 1..4 are candidates
function world(seed, { liftWord2 = 0.0, catBoost = 0.0 } = {}) {
  const r = new Rng(seed), samples = []
  for (let i = 0; i < 160; i++) {
    const cat = i % 2 ? 'forests' : 'kitchens', liked = r.float() < (cat === 'forests' ? 0.35 : 0.08)          // the person likes forests, and a few kitchens
    const look = Float64Array.from(words, (_, w) => 0.02 * r.gauss() + (w === 3 && cat === 'forests' ? catBoost : 0) + (w === 2 && liked ? liftWord2 : 0))
    samples.push({ cat, look, liked })
  }
  return samples
}
test('a word that is stronger on what was liked, inside its category, is found', () => {
  const found = discover(world(1, { liftWord2: 0.03 }), words)
  assert.deepEqual(found.map(f => f.index), [2])
})
test('a word that is only strong for a whole category (the liked ones happen to be there) is not found', () => {
  assert.deepEqual(discover(world(2, { catBoost: 0.06 }), words), [])
})
test('nothing is found from pure noise, or with too little to go on', () => {
  for (let s = 3; s < 13; s++) assert.deepEqual(discover(world(s), words), [], 'noise ' + s)
  assert.deepEqual(discover(world(1, { liftWord2: 0.03 }).slice(0, 30), words), [])
})
test('attributes already in the registry are never offered again', () => {
  assert.ok(!discover(world(1, { liftWord2: 0.03 }), [{ attr: 0 }, { attr: null }, { attr: 5 }, { attr: null }, { attr: null }]).some(f => f.index === 2))
})
