// @ts-check
import { discover } from '../core/discover.js'
import { getJSON, post } from './api.js'

/**
 * Looks for something the person likes that is not an attribute yet (see core/discover.js): with a reader of pictures on, from the pictures it has read and the ones that were liked.
 * Finding one adds it to the engine's list of attributes; from then on it can be asked for, and learned about, like the others.
 */
export class Discovery {
  /** @param {{world: import('../core/spiral.js').SpiralWorld, store: import('./images.js').ImageStore, atlas: import('../core/atlas.js').Atlas, liked: Set<number>, notify: (text: string) => void}} p */
  constructor({ world, store, atlas, liked, notify }) { this.world = world; this.store = store; this.atlas = atlas; this.liked = liked; this.notify = notify; this.busy = false }

  async look() {
    const { world, store, atlas } = this
    if (this.busy || !store.reader.on || !world.facets || !store.attrsOn) return
    this.busy = true
    try {
      const words = (await getJSON('/lexicon')).words
      if (words.length !== store.lookStat.mean.length) return            // the reader's list and the engine's are not the same yet
      const samples = []
      for (const [k, look] of store.looks) { const n = world.node(k); if (n) samples.push({ cat: atlas.categories[atlas.nearestConcept(n.z)], look, liked: this.liked.has(k) }) }
      const found = discover(samples, words)[0]; if (!found) return
      const w = words[found.index]
      await post(`/attrs/add?label=${encodeURIComponent(w.label)}&phrase=${encodeURIComponent(w.phrase)}&group=${encodeURIComponent(w.group)}`)
      const a = await getJSON('/attrs'); world.facets.setAttrs(a.attrs, a.nature, a.capacity)
      this.notify(`Found a look you like: ${w.label.toLowerCase()}`)
    } catch { } finally { this.busy = false }
  }
}
