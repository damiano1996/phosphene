// Does it learn a taste INSIDE a category? A simulated person who likes mountains, and of the mountain kinds only the pale rock and the snow, never the green meadows.
// Prints, over the mountain pictures in view, how many are of a liked kind, before and after the model has learned.   usage: node web/tools/simulate-facets.js [seeds=6] [steps=40]
import { SpiralWorld } from '../js/core/spiral.js'
import { T } from '../js/core/tuning.js'
import { applyTuning, loadAtlas, loadFacets, mean, pct, runSize } from './lib.js'

const atlas = loadAtlas(), facets = loadFacets()
const LIKED = new Set(['pale-rock', 'golden-hour']), DISLIKED = new Set(['green-meadow', 'spring'])          // of the mountains: pale rock, light at golden hour; never green meadows or spring
const MOUNT = new Set(atlas.names.map((n, i) => (/mountain|canyon|volcano|glacier|cliffs|fjord|cave/.test(n) ? i : -1)).filter(i => i >= 0))
const [seeds, steps] = runSize(6, 40), V = 4
applyTuning()

const kindOf = (n) => { const c = atlas.nearestConcept(n.z), v = facets.variantOf(n.seed, V), vec = facets.attrsOf(atlas.names[c], v, n.seed, true); return { c, v, attrs: [...vec].map((x, i) => (x ? facets.attrs[i].id : null)).filter(Boolean) } }
const score = (n) => { const { attrs } = kindOf(n); return attrs.filter(a => LIKED.has(a)).length - attrs.filter(a => DISLIKED.has(a)).length }

function run(seed) {
  const w = new SpiralWorld(seed, atlas, { facets }); w.variantCount = () => V; w.attrsActive = () => true; w.ensure(0, 0, 4000)
  const visited = new Set([0]), out = []; let cam = w.focus
  for (let s = 0; s < steps; s++) {
    const vis = w.nearby(cam.x, cam.y, 1700), mount = vis.filter(n => MOUNT.has(atlas.nearestConcept(n.z)))
    const likedShare = mount.length ? mount.filter(n => score(n) > 0).length / mount.length : NaN
    const dislikedShare = mount.length ? mount.filter(n => score(n) < 0).length / mount.length : NaN
    out.push({ s, n: mount.length, likedShare, dislikedShare })
    // the person goes to the best-looking mountain picture in view (a liked kind first, a disliked one never), else the first mountain, else anything nearby
    const cand = vis.filter(n => !visited.has(n.k) && Math.hypot(n.x - cam.x, n.y - cam.y) > 300)
    const rank = n => (MOUNT.has(atlas.nearestConcept(n.z)) ? (score(n) > 0 ? 3 : score(n) < 0 ? -1 : 1) : 0) * 1e6 + Math.hypot(n.x - cam.x, n.y - cam.y)
    const best = cand.sort((a, b) => rank(b) - rank(a))[0]; if (!best) break
    visited.add(best.k)
    w.dwell(best.k, score(best) > 0 ? 5000 : 1500); w.pick(best.k, 'view', T.VIEW_WEIGHT)
    if (score(best) > 0 && w.rng.float() < 0.7) w.save(best.k)
    if (score(best) < 0) w.dismiss(best.k)
    w.ensure(best.x, best.y, 2400); cam = best
  }
  return out
}
const runs = Array.from({ length: seeds }, (_, i) => run(2000 + i * 31))
const f = pct
console.log('steps    mountain pictures in view   liked kinds   disliked kinds')
for (const [a, b] of [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, steps]]) {
  const rows = runs.flatMap(r => r.slice(a, b)); if (!rows.length) continue
  console.log(`${String(a).padStart(2)}-${String(b).padEnd(3)}      ${mean(rows.map(r => r.n)).toFixed(0).padStart(6)}                  ${f(mean(rows.map(r => r.likedShare)))}        ${f(mean(rows.map(r => r.dislikedShare)))}`)
}
