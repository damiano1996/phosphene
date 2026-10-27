// A simulated person with a fixed taste browses the world like the real client does (go to the best-looking cell, linger, sometimes heart it); prints how much of what is made
// afterwards is of that taste, and how varied it stays.   usage: node web/tools/simulate.js [seeds=6] [steps=40]
import { SpiralWorld } from '../js/core/spiral.js'
import { T } from '../js/core/tuning.js'
import { applyTuning, loadAtlas, mean, pct, runSize } from './lib.js'

const atlas = loadAtlas()
const TARGET = new RegExp(process.env.RX ?? 'waterfall|\\btrees?\\b|forest|jungle|woods|redwood|oak|pine|willow|bamboo|mangrove|baobab|rainforest')
const isT = new Array(atlas.size).fill(false).map((_, i) => TARGET.test(atlas.names[i]))
const SCENIC = new Set(['landscapes', 'sky and weather', 'plants and forests', 'gardens and landscaping'])
const scenic = i => SCENIC.has(atlas.categoryNames[atlas.categoryOf(i)])
const R_VIEW = 1700, GEN_R = +(process.env.GEN_R ?? 4000)
applyTuning()
const [seeds, steps] = runSize(6, 40)

function run(seed) {
  const w = new SpiralWorld(seed, atlas); if (process.env.PRIOR_CAT) { const c = atlas.categoryId(process.env.PRIOR_CAT); w.applyPrior(atlas.conceptsIn(c), 0.3); } w.ensure(0, 0, 4000)
  const visited = new Set([0]), out = []; let cam = w.focus, freshFrom = null
  for (let s = 0; s < steps; s++) {
    const vis = w.nearby(cam.x, cam.y, R_VIEW), conc = n => atlas.nearestConcept(n.z)
    const freshVis = vis.filter(n => n.k >= 0 && freshFrom !== null && n.born >= freshFrom)
    const share = (l) => l.length ? l.filter(n => isT[conc(n)]).length / l.length : NaN
    const distinct = new Set(freshVis.filter(n => isT[conc(n)]).map(conc)).size
    const topConcept = freshVis.length ? Math.max(...[...freshVis.reduce((m, n) => m.set(conc(n), (m.get(conc(n)) ?? 0) + 1), new Map()).values()]) / freshVis.length : NaN
    out.push({ s, all: share(vis), fresh: share(freshVis), nFresh: freshVis.length, distinct, topConcept })
    // the person goes to the best target in view, else the most scenic, outwards first
    const cand = vis.filter(n => !visited.has(n.k) && Math.hypot(n.x - cam.x, n.y - cam.y) > 300)
    const rank = n => (isT[conc(n)] ? 2 : scenic(conc(n)) ? 1 : 0) * 1e6 + Math.hypot(n.x - cam.x, n.y - cam.y)
    const best = cand.sort((a, b) => rank(b) - rank(a))[0]; if (!best) break
    visited.add(best.k); const hit = isT[conc(best)]
    w.dwell(best.k, hit ? 5000 : 1500); w.pick(best.k, 'view', T.VIEW_WEIGHT)
    if (hit && w.rng.float() < 0.7) w.save(best.k)
    const dis = vis.find(n => !isT[conc(n)] && !scenic(conc(n)) && !w.isDismissed(n.k)); if (dis && s % 6 === 5) w.dismiss(dis.k)
    const made = w.ensure(best.x, best.y, GEN_R); made.forEach(n => (n.born = s)); cam = best
    if (freshFrom === null && w.model.signals().length >= 8) freshFrom = s + 1
    // cells made before there was a taste carry no `born`: treat them as -1
    for (const n of w.all) if (n.born === undefined) n.born = -1
  }
  return out
}
const runs = Array.from({ length: seeds }, (_, i) => run(1000 + i * 17))
const f = pct
console.log('steps      all-in-view  fresh-in-view  new-per-view  distinct-targets  top-concept-share')
for (const [a, b] of [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, steps]]) {
  const rows = runs.flatMap(r => r.slice(a, b))
  console.log(`${String(a).padStart(2)}-${String(b).padEnd(3)}    ${f(mean(rows.map(r => r.all)))}       ${f(mean(rows.map(r => r.fresh)))}         ${mean(rows.map(r => r.nFresh)).toFixed(0).padStart(4)}          ${mean(rows.map(r => r.distinct)).toFixed(1).padStart(5)}             ${f(mean(rows.map(r => r.topConcept)))}`)
}
