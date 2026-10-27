// @ts-check
/**
 * Finds looks the person likes that are not attributes yet. The reader of pictures compares every picture with a list of words (the attributes, then a lexicon of looks) and says how much
 * of each it shows, against that picture's own average. A word is worth adding when it is stronger on the pictures the person liked than on other pictures OF THE SAME KIND: what a
 * picture is of says more about its words than anything else (a forest lover's pictures are green), so each word is compared inside its category, and a word needs enough liked pictures
 * behind it to be more than chance. Pure numbers; the page decides what to do with the answer.
 * @typedef {{cat: string, look: ArrayLike<number>, liked: boolean}} Sample
 */
export const DISCOVER = { MIN_LIKED: 6, MIN_ALL: 40, Z: 3.2, EFFECT: 0.5, MIN_CATS: 1 }

/**
 * @param {Sample[]} samples pictures that have been read; `look[i]` goes with `words[i]`
 * @param {{attr: number|null}[]} words the words; only those that are not attributes yet (`attr === null`) can be found
 * @param {Partial<typeof DISCOVER>} [opt]
 * @returns {{index: number, z: number, effect: number, liked: number}[]} the words to add, strongest first
 */
export function discover(samples, words, opt = {}) {
  const o = { ...DISCOVER, ...opt }, liked = samples.filter(s => s.liked)
  if (liked.length < o.MIN_LIKED || samples.length < o.MIN_ALL) return []
  const W = words.length, byCat = new Map()
  for (const s of samples) { let a = byCat.get(s.cat); if (!a) byCat.set(s.cat, (a = { n: 0, sum: new Float64Array(W) })); a.n++; for (let i = 0; i < W; i++) a.sum[i] += s.look[i] }
  const gmean = new Float64Array(W); for (const s of samples) for (let i = 0; i < W; i++) gmean[i] += s.look[i] / samples.length
  const resid = s => { const c = byCat.get(s.cat), m = c && c.n >= 4 ? c.sum : null; return Float64Array.from({ length: W }, (_, i) => s.look[i] - (m ? m[i] / c.n : gmean[i])) }
  const all = samples.map(resid), sd = new Float64Array(W)
  for (const r of all) for (let i = 0; i < W; i++) sd[i] += r[i] * r[i] / all.length
  const lr = liked.map(resid), out = []
  for (let i = 0; i < W; i++) {
    if (words[i].attr !== null) continue
    const s = Math.sqrt(sd[i]); if (s < 1e-9) continue
    const m = lr.reduce((a, r) => a + r[i], 0) / lr.length, z = m / (s / Math.sqrt(lr.length)), effect = m / s
    if (z >= o.Z && effect >= o.EFFECT) out.push({ index: i, z, effect, liked: lr.length })
  }
  return out.sort((a, b) => b.z - a.z)
}
