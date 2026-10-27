// Does it find what the person really likes, when they only said which categories they were curious about? The simulated person picked several categories at the start, and likes a
// specific theme that crosses them (cosy, rustic, old things); nothing about the theme was told to the app. They browse like the real client (go to the best-looking picture, linger,
// sometimes heart it). Prints how many of the pictures on screen are of the theme, step by step, and how varied they are.   usage: node web/tools/simulate-discover.js [seeds=8] [steps=36]
import { SpiralWorld } from '../js/core/spiral.js'
import { Rng } from '../js/core/rng.js'
import { T } from '../js/core/tuning.js'
import { AP_BASE } from '../js/core/appearance.js'
import { applyTuning, loadAtlas, mean, pct, runSize } from './lib.js'

const atlas = loadAtlas()
const THEMES = {
  cosy: ['a stone cottage', 'a log cabin', 'a farmhouse', 'a thatched roof house', 'fresh bread', 'a cup of coffee', 'a cheese board', 'a cozy fireplace', 'a library', 'an old oak tree', 'a vintage car', 'a vintage motorcycle', 'a red rose', 'a cottage garden', 'a wildflower meadow', 'a tea ceremony', 'a bowl of soup', 'an attic', 'a steam train', 'a lighthouse'],
  sea: ['a coral reef', 'a jellyfish', 'a sea turtle', 'dolphins', 'a whale', 'a school of fish', 'seashells on a beach', 'a sailboat', 'a cruise ship', 'a fishing boat', 'a lighthouse', 'a houseboat', 'a beach at sunset', 'cliffs by the sea', 'a fjord', 'a harbor town', 'a surfer on a wave', 'a sailing race', 'seagulls over the sea', 'a gondola in venice'],
}
const THEME = THEMES[process.env.THEME ?? 'cosy']
const L = new Set(THEME.map(n => { const i = atlas.names.indexOf(n); if (i < 0) throw new Error('no concept ' + n); return i }))
const CATS = (process.env.CATS ?? 'houses,food and drink,interiors,flowers,plants and forests,cars and trucks,landscapes,baking and plating').split(',')          // what they said they were curious about
const [seeds, steps] = runSize(8, 36), R_VIEW = +(process.env.R_VIEW ?? 1700), GEN_R = +(process.env.GEN_R ?? 2400)
applyTuning()
const minDistToL = c => { let m = Infinity; for (const l of L) m = Math.min(m, atlas.distance(atlas.coords[c], l)); return m }
const affinity = Float64Array.from({ length: atlas.size }, (_, c) => (L.has(c) ? 0 : minDistToL(c)))          // how far a concept is from the theme (0: part of it)

function run(seed) {
  const pool = CATS.flatMap(c => atlas.conceptsIn(atlas.categoryId(c))), rng = new Rng(seed * 31 + 7)
  const w = new SpiralWorld(seed, atlas, { startConcept: pool[rng.int(pool.length)] }); if (process.env.AP) {          // pictures with a look: noise per concept and per picture, and the theme is cool and saturated (a sea: blue), as measured on real pictures
    const h = (c, i) => Math.sin(c * 12.9898 + i * 78.233) * 43758.5453 % 1
    w.apProvider = n => { const c = atlas.nearestConcept(n.z), a = new Float64Array(AP_BASE + w.model.attrs + w.model.tags).fill(NaN); for (let i = 0; i < 13; i++) a[i] = 0.6 * h(c, i) + 0.5 * h(n.seed % 9973, i + 40) + (L.has(c) && (i === 4 || i === 5) ? -0.9 : 0) + (L.has(c) && i === 2 ? 0.6 : 0); return a }
  }
  w.applyPrior([...pool].sort(() => rng.float() - 0.5).slice(0, 10), T.PRIOR_STRENGTH); w.ensure(0, 0, 4000)
  const visited = new Set([0]), out = []; let cam = w.focus
  for (let s = 0; s < steps; s++) {
    const vis = w.nearby(cam.x, cam.y, R_VIEW), conc = n => atlas.nearestConcept(n.z)
    const inL = vis.filter(n => L.has(conc(n))), distinct = new Set(inL.map(conc)).size
    const counts = new Map(); for (const n of inL) counts.set(conc(n), (counts.get(conc(n)) ?? 0) + 1)
    out.push({ s, share: vis.length ? inL.length / vis.length : 0, distinct, top: inL.length ? Math.max(...counts.values()) / inL.length : NaN })
    // the person goes to the picture that looks most like their theme (a picture of the theme first, else the nearest in kind), outwards first
    const cand = vis.filter(n => !visited.has(n.k) && Math.hypot(n.x - cam.x, n.y - cam.y) > 300)
    const rank = n => (L.has(conc(n)) ? 100 : -10 * affinity[conc(n)]) * 1e4 + Math.hypot(n.x - cam.x, n.y - cam.y)
    const best = cand.sort((a, b) => rank(b) - rank(a))[0]; if (!best) break
    visited.add(best.k); const hit = L.has(conc(best))
    w.dwell(best.k, hit ? 5000 : 1200); w.pick(best.k, 'view', T.VIEW_WEIGHT)
    if (hit && w.rng.float() < 0.8) w.save(best.k)
    const dis = vis.find(n => affinity[conc(n)] > 2.2 && !w.isDismissed(n.k)); if (dis && s % 7 === 6) w.dismiss(dis.k)
    w.ensure(best.x, best.y, GEN_R); cam = best
  }
  return out
}
const runs = Array.from({ length: seeds }, (_, i) => run(500 + i * 13))
const f = x => pct(x, ' -- ', '%')
const bands = [[0, 4], [4, 8], [8, 12], [12, 18], [18, 26], [26, steps]]
console.log('steps    theme share on screen   distinct theme concepts   biggest one')
for (const [a, b] of bands) { const r = runs.flatMap(x => x.slice(a, b)); console.log(`${String(a).padStart(2)}-${String(b).padEnd(3)}        ${f(mean(r.map(x => x.share)))}                 ${mean(r.map(x => x.distinct)).toFixed(1).padStart(5)}                  ${f(mean(r.map(x => x.top)))}`) }
const late = runs.flatMap(x => x.slice(12)), first = runs.flatMap(x => x.slice(0, 3)); console.log('SUMMARY first3', f(mean(first.map(x => x.share))), ' late', f(mean(late.map(x => x.share))), ' late-distinct', mean(late.map(x => x.distinct)).toFixed(1))
