// @ts-check
/**
 * The map of what the model has learned, as a tree: the person's taste at the centre, the groups of categories around it, then the categories, then every concept at the rim.
 * Pure geometry and numbers (the drawing is in app/graph.js).
 */

/** @typedef {{id: string, kind: 'group'|'category'|'concept', label: string, angle: number, r: number, x: number, y: number, parent: string, concept?: number, category?: string}} TreeNode */

/**
 * Lays the atlas out on rings. Leaves (concepts) are spaced evenly around the rim, with a gap between categories and a larger one between groups; a category sits at the mean
 * angle of its concepts and a group at the mean angle of its categories.
 * @param {import('./atlas.js').Atlas} atlas @param {[string, string[]][]} groups the categories by theme @param {{rings?: number[], catGap?: number, groupGap?: number}} [opt]
 * @returns {{nodes: TreeNode[], edges: [string, string][], leaves: TreeNode[], rings: number[]}}
 */
export function layout(atlas, groups, opt = {}) {
  const rings = opt.rings ?? [120, 215, 330], catGap = opt.catGap ?? 0.012, groupGap = opt.groupGap ?? 0.05
  const nodes = [], edges = [], leaves = []
  const cats = groups.map(([title, members]) => [title, members.filter(c => atlas.categoryId(c) >= 0)]).filter(([, m]) => m.length)
  const nLeaves = cats.reduce((s, [, m]) => s + m.reduce((t, c) => t + atlas.conceptsIn(atlas.categoryId(c)).length, 0), 0)
  const nCats = cats.reduce((s, [, m]) => s + m.length, 0)
  const step = (2 * Math.PI - groupGap * cats.length - catGap * (nCats - cats.length)) / nLeaves
  const put = (id, kind, label, angle, r, parent, extra = {}) => {
    const n = { id, kind, label, angle, r, x: r * Math.cos(angle), y: r * Math.sin(angle), parent, ...extra }; nodes.push(n); if (parent) edges.push([parent, id]); return n
  }
  let a = -Math.PI / 2                                                      // the first group starts at the top
  for (const [title, members] of cats) {
    const gStart = a, catNodes = []
    for (let i = 0; i < members.length; i++) {
      const cat = members[i], ids = atlas.conceptsIn(atlas.categoryId(cat)), cStart = a
      const ls = ids.map((c, j) => ({ c, angle: cStart + (j + 0.5) * step }))
      a += ids.length * step + (i < members.length - 1 ? catGap : 0)
      const cn = { cat, ls, angle: ls.reduce((s, l) => s + l.angle, 0) / ls.length }
      catNodes.push(cn)
    }
    const ga = catNodes.reduce((s, c) => s + c.angle, 0) / catNodes.length, gid = 'g:' + title
    put(gid, 'group', title, ga, rings[0], 'root')
    for (const cn of catNodes) {
      const cid = 'c:' + cn.cat; put(cid, 'category', cn.cat, cn.angle, rings[1], gid)
      for (const l of cn.ls) leaves.push(put('k:' + l.c, 'concept', atlas.names[l.c], l.angle, rings[2], cid, { concept: l.c, category: cn.cat }))
    }
    a += groupGap
    void gStart
  }
  nodes.unshift({ id: 'root', kind: 'group', label: 'You', angle: 0, r: 0, x: 0, y: 0, parent: '' })
  return { nodes, edges, leaves, rings }
}

/**
 * How much the model likes every concept (against the average concept) and how much it has to go on: the weight of the signals that were near it, from 0 (nothing: its score is
 * the prior, not a taste) to 1 (a lot). A concept that was never explored is not a dislike, and the picture keeps the two apart.
 * @param {import('./preference.js').PreferenceModel} model @param {import('./atlas.js').Atlas} atlas @param {number} [sigma] how far a signal reaches on the map
 * @returns {{score: Float64Array, seen: Float64Array, maxAbs: number}}
 */
export function tasteMap(model, atlas, sigma = 1.2) {
  const n = atlas.size, u = Float64Array.from({ length: n }, (_, i) => model.utility(atlas.coords[i]))
  const mean = u.reduce((s, v) => s + v, 0) / n, score = u.map(v => v - mean), seen = new Float64Array(n)
  const sig = model.signals().filter(s => s.z)
  for (let i = 0; i < n; i++) {
    let w = 0
    for (const s of sig) { let d2 = 0; const c = atlas.coords[i]; for (let j = 0; j < c.length; j++) { const d = c[j] - /** @type {Float64Array} */ (s.z)[j]; d2 += d * d } w += s.weight * Math.exp(-d2 / (2 * sigma * sigma)) }
    seen[i] = 1 - Math.exp(-w / 2)
  }
  return { score, seen, maxAbs: Math.max(1e-6, ...score.map(Math.abs)) }
}

/** The score of a category or group: the mean over its concepts, counted by how well each is known (0 if none is). */
export function aggregate(score, seen, concepts) {
  let s = 0, w = 0, k = 0
  for (const c of concepts) { s += score[c] * seen[c]; w += seen[c]; k += seen[c] }
  return { score: w > 1e-9 ? s / w : 0, seen: k / Math.max(1, concepts.length) }
}
