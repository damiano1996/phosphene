import test from 'node:test'
import assert from 'node:assert/strict'
import { SpiralWorld, Vogel } from '../js/core/spiral.js'
import { ViewingHistory, pickStart } from '../js/core/history.js'
import { T } from '../js/core/tuning.js'
import { atlas, catOf, Rng } from './helpers.js'

const R = 5 * T.SPACING, VIEW = 6 * T.SPACING
const walk = (w, dx, dy, steps, radius) => { let x = 0, y = 0; for (let i = 0; i < steps; i++) { x += dx; y += dy; w.ensure(x, y, radius) } }
const avg = a => a.reduce((s, v) => s + v, 0) / a.length

test('the map puts related concepts together', () => {
  assert.equal(atlas.dim, 12); assert.ok(atlas.size > 300)
  const cat = name => atlas.categoryOf(atlas.names.indexOf(name)), vehicles = ['motorbikes and bicycles', 'cars and trucks', 'air rail and water transport'].map(c => atlas.categoryId(c))
  const kin = (a, b) => a === b || (vehicles.includes(a) && vehicles.includes(b))
  for (const probe of ['a motorcycle', 'a tulip field', 'a jellyfish', 'a stone cottage', 'a sports car']) {
    const i = atlas.names.indexOf(probe)
    const nearest = [...Array(atlas.size).keys()].filter(j => j !== i).sort((a, b) => atlas.distance(atlas.coords[i], a) - atlas.distance(atlas.coords[i], b)).slice(0, 4)
    assert.ok(nearest.filter(j => kin(atlas.categoryOf(j), cat(probe))).length >= 3, probe)
  }
})

test('the engine and the app agree on what a cell shows', () => {
  const z = atlas.coords[atlas.names.indexOf('a motorcycle')], p = atlas.pick(z)
  assert.equal(atlas.names[p[0][0]], 'a motorcycle'); assert.ok(p[0][1] >= 0.5)
  const sc = atlas.coords[atlas.names.indexOf('a scooter')], mid = Float64Array.from(z, (v, i) => (v + sc[i]) / 2)
  assert.equal(atlas.pick(mid).length, 2)
  for (let i = 0; i < atlas.size; i++) {
    const q = atlas.pick(atlas.coords[i]); if (q.length < 2) continue
    const relatives = [...Array(atlas.size).keys()].filter(j => j !== i).sort((a, b) => atlas.distance(atlas.coords[i], a) - atlas.distance(atlas.coords[i], b)).slice(0, 6)
    assert.ok(relatives.includes(q[1][0]), `${atlas.names[i]} blends with ${atlas.names[q[1][0]]}`)
  }
})

test('grows forever in every direction', () => {
  for (let dir = 0; dir < 8; dir++) {
    const a = dir * Math.PI / 4, w = new SpiralWorld(dir + 1, atlas), step = T.SPACING * 0.6
    walk(w, Math.cos(a) * step, Math.sin(a) * step, 120, 4.5 * T.SPACING)
    const ex = Math.cos(a) * step * 120, ey = Math.sin(a) * step * 120, lim = Math.trunc((((Math.hypot(ex, ey) + 4.5 * T.SPACING) / (T.SPACING / 1.9046)) ** 2)) + 1
    let want = 0; for (let k = 0; k <= lim; k++) if (Math.hypot(Vogel.x(k) - ex, Vogel.y(k) - ey) <= 4.5 * T.SPACING) want++
    const have = w.nearby(ex, ey, 4.5 * T.SPACING).length
    assert.ok(Math.abs(want - have) <= want * 0.02 + 1, `dir ${dir}: cells missing around the viewer (${have} of ${want})`)
  }
})

test('every cell is connected to the start and never changes', () => {
  const w = new SpiralWorld(3, atlas), rng = new Rng(3)
  walk(w, T.SPACING * 0.6, 0, 20, 4 * T.SPACING)
  const snap = new Map(); for (let k = 0; k <= 5000; k++) { const n = w.node(k); if (n) snap.set(k, [Float64Array.from(n.z), n.seed]) }
  let x = 20 * T.SPACING * 0.6, y = 0
  for (let i = 0; i < 60; i++) { x += rng.gauss() * 30; y += rng.gauss() * 30; w.ensure(x, y, 4 * T.SPACING); const c = w.nearby(x, y, T.SPACING)[0]; if (c) w.pick(c.k) }
  for (const [k, v] of snap) { assert.deepEqual(Array.from(w.node(k).z), Array.from(v[0]), `cell ${k} changed`); assert.equal(w.node(k).seed, v[1]) }
  const seen = new Set([0]), q = [w.node(0)]
  while (q.length) { const c = q.shift(); for (const n of w.nearby(c.x, c.y, T.NEIGHBOUR_R)) if (!seen.has(n.k)) { seen.add(n.k); q.push(n) } }
  assert.equal(w.size, seen.size, 'some cells were generated away from the rest of the world')
})

test('neighbours are related and flowers are not next to buildings', () => {
  const flowers = atlas.categoryId('flowers'), buildings = new Set(['houses', 'city and monuments', 'interiors'].map(c => atlas.categoryId(c)))
  let agree = 0, cells = 0, flowerCells = 0, flowerByBuilding = 0
  for (let seed = 1; seed <= 6; seed++) {
    const w = new SpiralWorld(seed, atlas); w.ensure(0, 0, 8 * T.SPACING)
    for (const n of w.nearby(0, 0, 7 * T.SPACING)) {
      const c = catOf(n), ring = w.nearby(n.x, n.y, 1.6 * T.SPACING).filter(m => m.k !== n.k); if (!ring.length) continue
      cells++; agree += ring.filter(m => catOf(m) === c).length / ring.length
      if (c === flowers) { flowerCells++; flowerByBuilding += ring.filter(m => buildings.has(catOf(m))).length / ring.length }
    }
  }
  assert.ok(agree / cells > 0.3, `neighbours agree too rarely: ${agree / cells}`)
  if (flowerCells > 5) assert.ok(flowerByBuilding / flowerCells < 0.15, `flowers by buildings: ${flowerByBuilding / flowerCells}`)
})

test('every screen shows several categories', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const w = new SpiralWorld(seed, atlas); w.ensure(0, 0, R)
    const cats = new Set(w.nearby(0, 0, R).map(n => catOf(n)))
    assert.ok(cats.size >= 3, `seed ${seed}: only ${cats.size} categories on screen`)
  }
})

const likeShare = (seed, learn, category, picks) => {
  const w = new SpiralWorld(seed, atlas, { learn }), cat = atlas.categoryId(category), pool = atlas.conceptsIn(cat)
  const u = n => -Math.min(...pool.map(i => atlas.distance(n.z, i)))
  w.ensure(0, 0, VIEW)
  for (let i = 0; i < picks; i++) {
    const c = w.focus, near = w.nearby(c.x, c.y, 5 * T.SPACING)
    let outward = near.filter(n => Math.hypot(n.x, n.y) > Math.hypot(c.x, c.y) + 0.5 * T.SPACING); if (!outward.length) outward = near
    const best = outward.reduce((a, b) => (u(b) > u(a) ? b : a)); w.pick(best.k); w.ensure(best.x, best.y, VIEW)
  }
  const c = w.focus, area = w.nearby(c.x, c.y, 5 * T.SPACING)
  return area.filter(n => catOf(n) === cat).length / area.length
}

test('learning turns the world towards what the viewer likes', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1)
  const withL = avg(seeds.map(s => likeShare(s, true, 'flowers', 20))), without = avg(seeds.map(s => likeShare(s, false, 'flowers', 20)))
  assert.ok(withL > without * 1.2, `with=${withL} without=${without}`)
})

test('the taste profile names what the viewer likes', () => {
  let hits = 0
  for (let seed = 1; seed <= 10; seed++) {
    const w = new SpiralWorld(seed, atlas), pool = atlas.conceptsIn(atlas.categoryId('sea life')); w.ensure(0, 0, R)
    for (let i = 0; i < 20; i++) { const c = w.focus; const best = w.nearby(c.x, c.y, 5 * T.SPACING).reduce((a, b) => (-Math.min(...pool.map(p => atlas.distance(b.z, p))) > -Math.min(...pool.map(p => atlas.distance(a.z, p))) ? b : a)); w.pick(best.k); w.ensure(best.x, best.y, R) }
    const top = Object.entries(w.taste()).sort((a, b) => b[1] - a[1]).slice(0, 3)
    if (top.some(e => e[0] === 'sea life')) hits++
  }
  assert.ok(hits >= 6, `only ${hits} of 10`)
})

test('hidden categories never come back', () => {
  const hide = new Set([atlas.categoryNames[0], atlas.categoryNames[5]]), sub = atlas.without(hide)
  assert.equal(sub.version, atlas.version); assert.ok(sub.size < atlas.size && !sub.categoryNames.some(c => hide.has(c)))
  const world = new SpiralWorld(7, sub); world.ensure(0, 0, 1500)
  const seen = new Set(world.nearby(0, 0, 1500).map(n => sub.categoryNames[sub.categoryOf(sub.nearestConcept(n.z))]))
  assert.ok(![...seen].some(c => hide.has(c)) && seen.size > 5)
})

test('a stay is one observation and a passing glance is none', () => {
  const w = new SpiralWorld(2, atlas); w.ensure(0, 0, R)
  const n0 = w.model.events; w.dwell(0, 300); w.flushDwell(); assert.equal(w.model.events, n0)
  const k = w.nearby(0, 0, T.SPACING)[1].k; w.dwell(0, 3000); w.dwell(k, 3000); w.flushDwell(); assert.equal(w.model.events, n0 + 1)
})

test('launches do not all start on the same concept', () => {
  const h = new ViewingHistory(), flowers = atlas.categoryId('flowers'), liked = atlas.conceptsIn(flowers); liked.forEach(c => h.like(c, 2))
  const r = new Rng(1), starts = []
  for (let i = 0; i < 30; i++) { const s = pickStart(atlas, h, [], r); starts.push(s); h.launched(s); for (const c of [...liked].sort(() => r.float() - 0.5).slice(0, 3)) h.like(c, 1.5) }
  const counts = new Map(); starts.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1))
  assert.ok(Math.max(...counts.values()) / 30 < 0.35, 'same start too often')
  assert.ok(new Set(starts).size >= 12, 'too few different starts')
  assert.ok(starts.filter(s => atlas.categoryOf(s) === flowers).length / 30 > 3 * liked.length / atlas.size, 'does not follow the history')
})

test('no history is varied too', () => {
  const r = new Rng(2), h = new ViewingHistory(), starts = []
  for (let i = 0; i < 30; i++) { const s = pickStart(atlas, h, [], r); starts.push(s); h.launched(s) }
  const counts = new Map(); starts.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1))
  assert.ok(Math.max(...counts.values()) / 30 < 0.2)
  assert.ok(starts.every((s, i) => i === 0 || s !== starts[i - 1]), 'never the same twice in a row')
})

test('history survives being stored', () => {
  const h = new ViewingHistory(); h.like(5, 2); h.like(9, 1.5); h.launched(5); h.launched(7)
  const back = ViewingHistory.from(JSON.parse(JSON.stringify(h)))
  assert.deepEqual(back.recent, h.recent); assert.deepEqual([...back.liked.keys()], [...h.liked.keys()])
  assert.equal(ViewingHistory.from(null).liked.size, 0)
})

test('placeholder colours come from the icon palette and differ between unrelated concepts', () => {
  const col = n => atlas.placeholder(atlas.coords[atlas.names.indexOf(n)])
  for (let i = 0; i < atlas.size; i += 7) { const [r, g, b] = atlas.placeholder(atlas.coords[i]); assert.ok(r >= 100 && r <= 255 && g >= 60 && g <= 230 && b >= 60 && b <= 255, `concept ${i}: ${r},${g},${b}`) }
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  assert.ok(d(col('a motorcycle'), col('a tulip field')) > 40, 'unrelated concepts should not share a colour')
  const hidden = atlas.without(new Set([atlas.categoryNames[0]])), j = hidden.names.indexOf('a motorcycle')
  assert.deepEqual(hidden.placeholder(hidden.coords[j]), col('a motorcycle'), 'hiding categories must not recolour the rest')
})
