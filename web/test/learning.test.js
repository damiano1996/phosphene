import test from 'node:test'
import assert from 'node:assert/strict'
import { PreferenceModel } from '../js/core/preference.js'
import { SpiralWorld } from '../js/core/spiral.js'
import { appearanceOf, styleOnly, styleOf, AP_DIM, AP_TRAITS, STYLE_BY_SEED } from '../js/core/appearance.js'
import { T } from '../js/core/tuning.js'
import { atlas, Rng } from './helpers.js'

const DAY = 864e5
const flowers = atlas.conceptsIn(atlas.categoryId('flowers')), vehicles = atlas.conceptsIn(atlas.categoryId('cars and trucks'))
const mean = (m, cs) => cs.reduce((s, c) => s + m.utility(atlas.coords[c]), 0) / cs.length
/** one pick of a concept of `pool` among a few random others */
const pickFrom = (m, pool, rng, t, type = 'pick', w = 1) => {
  const chosen = atlas.coords[pool[rng.int(pool.length)]], others = Array.from({ length: 7 }, () => atlas.coords[rng.int(atlas.size)])
  m.observeChoice([chosen, ...others], 0, w, false, { type, t })
}
const fresh = (opt = {}) => new PreferenceModel(1, atlas.dim, { clock: () => 1e12, ...opt })

test('adaptation: after flowers and then vehicles, vehicles rank above flowers', () => {
  const m = fresh(), rng = new Rng(4)
  for (let i = 0; i < 40; i++) pickFrom(m, flowers, rng, 1e12 - (80 - i) * 1000)
  assert.ok(mean(m, flowers) > mean(m, vehicles), 'flowers first')
  for (let i = 0; i < 40; i++) pickFrom(m, vehicles, rng, 1e12 - (40 - i) * 1000)
  assert.ok(mean(m, vehicles) > mean(m, flowers), `vehicles ${mean(m, vehicles)} flowers ${mean(m, flowers)}`)
})

test('stability: three picks of something else do not wipe out an established taste', () => {
  const m = fresh(), rng = new Rng(5)
  const all = [...Array(atlas.size).keys()]
  for (let i = 0; i < 60; i++) pickFrom(m, flowers, rng, 1e12 - (63 - i) * 1000)
  const before = mean(m, flowers) - mean(m, all)
  for (let i = 0; i < 3; i++) pickFrom(m, vehicles, rng, 1e12 - (3 - i) * 1000)
  assert.ok(mean(m, flowers) - mean(m, all) > 0.7 * before, 'the established taste survives a few odd picks')
  assert.ok(mean(m, vehicles) - mean(m, all) < mean(m, flowers) - mean(m, all), 'and the odd picks do not overtake it')
})

test('the window slides: only the last `window` observations are kept', () => {
  const m = fresh({ window: 30 }), rng = new Rng(6)
  for (let i = 0; i < 50; i++) pickFrom(m, flowers, rng, 1e12)
  assert.equal(m.signals().length, 30)
})

test('time: the same signals count for less when they are old', () => {
  const a = fresh(), b = fresh(), ra = new Rng(7), rb = new Rng(7)
  for (let i = 0; i < 30; i++) { pickFrom(a, flowers, ra, 1e12 - 100); pickFrom(b, flowers, rb, 1e12 - 28 * DAY) }
  const gap = m => mean(m, flowers) - mean(m, vehicles)
  assert.ok(gap(b) < gap(a) * 0.9, `fresh ${gap(a)} old ${gap(b)}`)
})

test('saved observations restore to the same taste, and are small', () => {
  const m = fresh(), rng = new Rng(8)
  for (let i = 0; i < T.WINDOW + 20; i++) pickFrom(m, i % 3 ? flowers : vehicles, rng, 1e12 - (T.WINDOW + 20 - i) * 60000, i % 5 ? 'pick' : 'save', i % 5 ? 1 : 3)
  const json = JSON.parse(JSON.stringify(m.toJSON())), bytes = JSON.stringify(json).length
  const m2 = new PreferenceModel(999, atlas.dim, { clock: () => 1e12 })              // another world seed: the features are the same all the same
  assert.equal(m2.restore(json), T.WINDOW)
  const us = [...Array(atlas.size).keys()].map(c => [m.utility(atlas.coords[c]), m2.utility(atlas.coords[c])]), n = us.length
  const sx = us.reduce((a, [x]) => a + x, 0), sy = us.reduce((a, [, y]) => a + y, 0), sxy = us.reduce((a, [x, y]) => a + x * y, 0), sxx = us.reduce((a, [x]) => a + x * x, 0), syy = us.reduce((a, [, y]) => a + y * y, 0)
  const corr = (sxy - sx * sy / n) / Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n))
  assert.ok(corr > 0.995, `the restored taste is the same taste (correlation ${corr})`)
  assert.ok(bytes < 600000, `the saved window is ${bytes} bytes`)
  assert.equal(new PreferenceModel(1, atlas.dim).restore({ v: 2, events: [] }), 0, 'a format that is not ours is ignored')
})

test('restoring twice does not decay the weights a second time', () => {
  const m = fresh(), rng = new Rng(9)
  for (let i = 0; i < 40; i++) pickFrom(m, flowers, rng, 1e12 - (40 - i) * 1000)
  const w1 = m.effectiveWeights(), m2 = fresh(); m2.restore(JSON.parse(JSON.stringify(m.toJSON()))); const m3 = fresh(); m3.restore(JSON.parse(JSON.stringify(m2.toJSON())))
  const w3 = m3.effectiveWeights(); for (let i = 0; i < w1.length; i++) assert.ok(Math.abs(w1[i] - w3[i]) < 1e-9)
})

test('forgetting one signal, or undoing a save, changes the taste', () => {
  const m = fresh(), rng = new Rng(10)
  for (let i = 0; i < 20; i++) pickFrom(m, vehicles, rng, 1e12 - 1000)
  const id = m.signals()[0].id, z = Array.from(atlas.coords[flowers[2]]), others = Array.from({ length: 7 }, () => atlas.coords[rng.int(atlas.size)])
  m.observeChoice([atlas.coords[flowers[2]], ...others], 0, 3, false, { type: 'save', t: 1e12 })
  const withSave = m.utility(atlas.coords[flowers[2]]); assert.ok(m.removeLast('save', z)); assert.ok(m.utility(atlas.coords[flowers[2]]) < withSave, 'undoing a save takes its effect back')
  const before = m.signals().length; assert.ok(m.remove(id)); assert.equal(m.signals().length, before - 1)
  m.clear(); assert.equal(m.signals().length, 0)
})

test('a save counts for more than a pick', () => {
  const a = fresh(), b = fresh(), ra = new Rng(11), rb = new Rng(11)
  for (let i = 0; i < 3; i++) { pickFrom(a, flowers, ra, 1e12, 'pick', 1); pickFrom(b, flowers, rb, 1e12, 'save', T.SAVE_WEIGHT) }
  assert.ok(mean(b, flowers) - mean(b, vehicles) > mean(a, flowers) - mean(a, vehicles))
})

test('appearance of a picture: bright and dark, symmetric and not, colourful and grey', () => {
  const W = 48, make = f => { const d = new Uint8ClampedArray(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const [r, g, b] = f(x, y); const i = 4 * (y * W + x); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255 } return d }
  const T_ = n => AP_TRAITS.indexOf(n)
  const bright = appearanceOf(make(() => [230, 230, 230]), W, W, 0), dark = appearanceOf(make(() => [20, 20, 20]), W, W, 0)
  assert.ok(bright[T_('light')] > 0.8 && dark[T_('light')] < 0.15 && dark[T_('dark')] === 1 && bright[T_('bright')] === 1)
  const red = appearanceOf(make(() => [220, 40, 30]), W, W, 0), blue = appearanceOf(make(() => [30, 60, 220]), W, W, 0), grey = appearanceOf(make(() => [128, 128, 128]), W, W, 0)
  assert.ok(red[T_('warm')] > 0.5 && blue[T_('warm')] < -0.5 && red[T_('saturation')] > 0.7 && grey[T_('saturation')] === 0 && red[T_('colourful')] > grey[T_('colourful')])
  assert.ok(red[T_('hue_x')] > 0 && Math.abs(blue[T_('hue_y')]) > 0.1, 'the hue is a direction')
  const sym = appearanceOf(make((x, y) => { const v = Math.abs(x - 23.5) * 8; return [v, v, v] }), W, W, 0), asym = appearanceOf(make((x) => [x * 5, x * 5, x * 5]), W, W, 0)
  assert.ok(sym[T_('symmetry')] > 0.99 && asym[T_('symmetry')] < 0.6)
  const centre = appearanceOf(make((x, y) => (x > 12 && x < 36 && y > 12 && y < 36 ? [(x * 7 + y * 13) % 255, 100, 50] : [90, 90, 90])), W, W, 0)
  assert.ok(centre[T_('centre')] > 1.5, 'the detail is in the middle')
  const sky = appearanceOf(make((x, y) => { const v = 255 - y * 5; return [v, v, v] }), W, W, 0); assert.ok(sky[T_('sky')] > 0.3, 'light at the top')
  assert.equal(bright.length, AP_DIM)
})

test('the style comes from the seed, as the engine reads it', () => {
  for (let seed = 0; seed < 64; seed++) { const s = styleOnly(seed), one = Array.from(s).slice(AP_TRAITS.length); assert.equal(one.indexOf(1), STYLE_BY_SEED[seed % 8]); assert.equal(styleOf(seed), STYLE_BY_SEED[seed % 8]) }
})

test('the model learns what the pictures look like, apart from what they show', () => {
  const m = fresh(), rng = new Rng(12), lightIdx = AP_TRAITS.indexOf('light')
  const ap = (light, style) => { const a = styleOnly(style * 4 + (style === 2 ? 3 : 0)); for (let i = 0; i < AP_TRAITS.length; i++) a[i] = 0.5 + 0.1 * rng.gauss(); a[lightIdx] = light; return a }
  for (let i = 0; i < 40; i++) {
    const shown = Array.from({ length: 8 }, () => atlas.coords[rng.int(atlas.size)]), aps = shown.map(() => ap(0.15 + 0.7 * rng.float(), rng.int(3)))
    const chosen = aps.reduce((b, a, k) => (a[lightIdx] > aps[b][lightIdx] ? k : b), 0)         // always the brightest
    m.observeChoice(shown, chosen, 1, false, { t: 1e12, ap: aps })
  }
  const dark = ap(0.2, 0), light = ap(0.85, 0)
  assert.ok(m.appearanceUtility(light) > m.appearanceUtility(dark), 'brighter pictures are liked')
})

test('a world: signals are logged, saves count, an unsave is undone, paused learning learns nothing, and the style follows the taste', () => {
  const w = new SpiralWorld(3, atlas); w.ensure(0, 0, 1200)
  const k = w.nearby(0, 0, 300)[1].k
  w.pick(k); assert.equal(w.model.signals().at(0).type, 'pick')
  w.pick(k, 'view', T.VIEW_WEIGHT); assert.equal(w.model.signals().at(0).type, 'view')
  w.save(k); assert.equal(w.model.signals().at(0).type, 'save'); assert.ok(w.unsave(k)); assert.notEqual(w.model.signals().at(0).type, 'save')
  const n = w.model.signals().length; w.learning = false; w.pick(k); w.save(k); w.dismiss(w.nearby(0, 0, 400)[2].k); assert.equal(w.model.signals().length, n, 'paused')
  w.learning = true; w.dismiss(w.nearby(0, 0, 400)[3].k); assert.equal(w.model.signals().at(0).type, 'dismiss')
})

test('style steering: after many picks of paintings, new cells are more often paintings', () => {
  const share = learn => {
    let paint = 0, total = 0
    for (let seed = 1; seed <= 8; seed++) {
      const w = new SpiralWorld(seed, atlas); w.ensure(0, 0, 1500)
      if (learn) for (let i = 0; i < 40; i++) {
        const near = w.nearby(0, 0, 4 * T.SPACING), idx = near.findIndex((n, q) => q > 0 && styleOf(n.seed) === 2), pickK = (idx >= 0 ? near[idx] : near[1]).k
        w.pick(pickK, 'save', T.SAVE_WEIGHT)
      }
      const before = new Set([...w.all].map(n => n.k)); w.ensure(2500, 0, 2000); w.ensure(-2500, 1500, 2000)
      for (const n of w.all) if (!before.has(n.k)) { total++; if (styleOf(n.seed) === 2) paint++ }
    }
    return paint / total
  }
  const learned = share(true), plain = share(false)
  assert.ok(learned > plain + 0.03, `painting share: learned ${learned} plain ${plain}`)
})

import { describe } from '../js/core/learned.js'

test('what it learned: counts, a liked category on top, concepts by name, and the style it favours', () => {
  const m = fresh(), rng = new Rng(14)
  for (let i = 0; i < 40; i++) {
    const chosen = atlas.coords[flowers[rng.int(flowers.length)]], others = Array.from({ length: 7 }, () => atlas.coords[rng.int(atlas.size)])
    const aps = [styleOnly(8 * i + 7), ...others.map((_, q) => styleOnly(8 * (i + q) + 0))]            // the favoured ones are paintings
    m.observeChoice([chosen, ...others], 0, i % 4 ? 1 : 3, false, { type: i % 4 ? 'pick' : 'save', t: 1e12, ap: aps })
  }
  const d = describe(m, atlas)
  assert.equal(d.n, 40); assert.equal(d.counts.save, 10); assert.equal(d.counts.pick, 30)
  assert.equal(d.categories[0].name, 'flowers'); assert.ok(d.top.length === 8 && typeof d.top[0].name === 'string')
  assert.ok(d.styles[2].share > d.styles[0].share * 0.6 && d.styles[2].share > 1 / 8, `painting share ${d.styles[2].share}`)
  assert.ok(Math.abs(d.styles.reduce((s, x) => s + x.share, 0) - 1) < 1e-9)
  assert.equal(describe(fresh(), atlas).enough, false)
})

test('words from a reader of pictures: the model learns which words go with what is chosen', () => {
  const TAGS = 6, m = new PreferenceModel(1, atlas.dim, { tags: TAGS, clock: () => 1e12 }), rng = new Rng(21)
  const ap = (word) => { const a = new Float64Array(AP_DIM + TAGS).fill(NaN); for (let i = 0; i < AP_DIM; i++) a[i] = 0; for (let j = 0; j < TAGS; j++) a[AP_DIM + j] = j === word ? 0.9 : 0.05; return a }
  for (let i = 0; i < 40; i++) {
    const shown = Array.from({ length: 8 }, () => atlas.coords[rng.int(atlas.size)]), words = shown.map(() => rng.int(TAGS)), chosen = Math.max(0, words.indexOf(2))
    m.observeChoice(shown, chosen, 1, false, { t: 1e12, ap: words.map(ap) })
  }
  const d = describe(m, atlas, Array.from({ length: TAGS }, (_, j) => ({ id: 'w' + j, label: 'word ' + j, group: 'g' })))
  assert.equal(d.words[0].id, 'w2'); assert.ok(d.words[0].weight > 0)
  const back = new PreferenceModel(5, atlas.dim, { tags: TAGS, clock: () => 1e12 }); back.restore(JSON.parse(JSON.stringify(m.toJSON())))
  assert.ok(describe(back, atlas, [{ id: 'w0', label: 'x', group: 'g' }, { id: 'w1', label: 'x', group: 'g' }, { id: 'w2', label: 'x', group: 'g' }]).words.some(w => w.id === 'w2'), 'the words survive a restore')
  const fewer = new PreferenceModel(5, atlas.dim, { tags: 3, clock: () => 1e12 }); assert.ok(fewer.restore(JSON.parse(JSON.stringify(m.toJSON()))) > 0, 'a vocabulary of another size is tolerated')
})
