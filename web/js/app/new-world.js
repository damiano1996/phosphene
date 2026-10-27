// @ts-check
import { T } from '../core/tuning.js'
import { SpiralWorld } from '../core/spiral.js'
import { ViewingHistory, pickStart } from '../core/history.js'
import { Rng } from '../core/rng.js'
import { worldSeed } from './testing.js'

/** A world that starts from somewhere new each launch: near what the person liked before and in the categories they named, but not where the last launches started. */
export function newWorld(atlas, full, user, tags = 0, facets = null) {
  const seed = worldSeed()
  const toShown = i => atlas.names.indexOf(full.names[i])             // the history is against the whole map; the world only knows the categories that are shown
  const pool = user.favs.filter(c => atlas.categoryId(c) >= 0).flatMap(c => atlas.conceptsIn(atlas.categoryId(c)))
  const hist = new ViewingHistory()
  for (const [c, v] of user.history.liked) { const s = toShown(c); if (s >= 0) hist.liked.set(s, v) }
  for (const c of user.history.recent) { const s = toShown(c); if (s >= 0) hist.recent.push(s) }
  const rng = new Rng(seed), start = pickStart(atlas, hist, pool, rng)
  const liked = [...hist.liked].sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0])
  user.history.launched(full.names.indexOf(atlas.names[start])); user.saveHistory()
  const shuffled = [...pool].sort(() => rng.float() - 0.5).slice(0, 10), prior = [...new Set([...shuffled, ...liked])]
  const world = new SpiralWorld(seed, atlas, { startConcept: start, tags, facets })
  if (user.learn) world.model.restore(user.learn)                         // what was learned in earlier launches (the window of signals), fitted once
  if (prior.length) world.applyPrior(prior, world.model.events >= 10 ? 0 : T.PRIOR_STRENGTH)      // a taste already learned needs no group start; the islands of favourites still help
  world.model.onChange = () => { user.learn = world.model.toJSON(); user.save() }
  return world
}
