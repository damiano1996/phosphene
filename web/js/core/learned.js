// @ts-check
import { AP_TRAITS, AP_BASE, STYLE_NAMES } from './appearance.js'
import { T } from './tuning.js'

/** What a trait means at each end, in words. `hue_x` and `hue_y` together make one direction of colour. */
export const TRAIT_WORDS = {
  light: ['bright, airy pictures', 'dark, moody pictures'], contrast: ['strong contrast', 'soft, low-contrast pictures'], saturation: ['saturated, vivid colour', 'muted, faded colour'],
  colourful: ['many different colours', 'a few colours'], warm: ['warm tones', 'cool tones'], detail: ['lots of detail and texture', 'clean, simple surfaces'],
  symmetry: ['symmetric compositions', 'asymmetric compositions'], centre: ['a subject in the middle', 'open compositions with no single centre'],
  sky: ['light at the top (skies, windows)', 'light at the bottom'], dark: ['deep shadows', 'no deep shadows'], bright: ['bright highlights', 'no blown-out highlights'],
}
const HUES = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']

/**
 * What the model has understood about a person, in a form a screen can show: how many signals of each kind it rests on, the taste by category and by concept (over the whole map, hidden
 * categories included), what they like in the pictures themselves (colour, light, detail, composition, style) and how sure the model is of each.
 * @param {import('./preference.js').PreferenceModel} model @param {import('./atlas.js').Atlas} atlas the whole map @param {{id: string, label: string, group: string}[]} [vocab] the words of the reader of pictures, if there is one
 */
export function describe(model, atlas, vocab = [], facets = null) {
  const signals = model.signals(), counts = {}; for (const s of signals) counts[s.type] = (counts[s.type] ?? 0) + 1
  const u = Array.from({ length: atlas.size }, (_, i) => model.utility(atlas.coords[i])), mean = u.reduce((a, b) => a + b, 0) / u.length
  const cats = atlas.categoryNames.map((name, c) => { const cs = atlas.conceptsIn(c); return { name, score: cs.reduce((s, i) => s + u[i] - mean, 0) / cs.length } }).sort((a, b) => b.score - a.score)
  const order = u.map((v, i) => [v - mean, i]).sort((a, b) => b[0] - a[0]), name = i => atlas.names[i]
  const top = order.slice(0, 8).map(([score, i]) => ({ name: name(i), category: atlas.categories[i], score })), bottom = order.slice(-5).reverse().map(([score, i]) => ({ name: name(i), category: atlas.categories[i], score }))
  const nz = model.nz, traits = []
  AP_TRAITS.forEach((t, i) => {
    if (t === 'hue_x' || t === 'hue_y') return
    const w = model.mu[nz + i] * T.AP_SCALE, sd = model.sigma[nz + i] * T.AP_SCALE, z = w / sd
    if (Math.abs(z) >= 1 && Math.abs(w) > 0.12) traits.push({ trait: t, weight: w, sure: Math.min(1, Math.abs(z) / 3), text: TRAIT_WORDS[t][w > 0 ? 0 : 1] })
  })
  const hx = AP_TRAITS.indexOf('hue_x'), hy = AP_TRAITS.indexOf('hue_y'), wx = model.mu[nz + hx] * T.AP_SCALE, wy = model.mu[nz + hy] * T.AP_SCALE, sx = model.sigma[nz + hx] * T.AP_SCALE, sy = model.sigma[nz + hy] * T.AP_SCALE
  if (Math.hypot(wx, wy) > 0.15 && Math.hypot(wx, wy) > 1.2 * Math.hypot(sx, sy)) {
    const a = Math.atan2(wy, wx) / (Math.PI / 3); traits.push({ trait: 'hue', weight: Math.hypot(wx, wy), sure: Math.min(1, Math.hypot(wx, wy) / (3 * Math.hypot(sx, sy))), text: `${HUES[((Math.round(a) % 6) + 6) % 6]} hues` })
  }
  traits.sort((a, b) => Math.abs(b.weight) * b.sure - Math.abs(a.weight) * a.sure)
  const sBase = nz + AP_TRAITS.length, odds = [4 / 8, 3 / 8, 1 / 8], w3 = [0, 1, 2].map(i => model.mu[sBase + i] * T.AP_SCALE), mw = (w3[0] + w3[1] + w3[2]) / 3
  const lg = odds.map((o, i) => Math.log(o) + 0.8 * (w3[i] - mw)), mx = Math.max(...lg), e = lg.map(v => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0)
  const styles = STYLE_NAMES.map((n, i) => ({ name: n, share: e[i] / z, weight: w3[i] - mw }))
  // words: what the reader of pictures says, and what the model has made of it (only the words it is fairly sure about)
  const words = []
  vocab.forEach((v, j) => { const i = nz + AP_BASE + model.attrs + j; if (i >= model.nf) return; const w = model.mu[i], sd = model.sigma[i]; if (Math.abs(w / sd) >= 1 && Math.abs(w) > 0.12) words.push({ id: v.id, label: v.label, group: v.group, weight: w, sure: Math.min(1, Math.abs(w / sd) / 3) }) })
  words.sort((a, b) => Math.abs(b.weight) * b.sure - Math.abs(a.weight) * a.sure)
  // the finer kinds: what it has learned about the attributes of the kinds of concepts (pale rock, golden hour, fog...), the same words for every concept
  const looks = []
  if (facets && model.attrs === facets.A) facets.attrs.forEach((a, j) => { const i = nz + AP_BASE + j, w = model.mu[i], sd = model.sigma[i]; if (Math.abs(w / sd) >= 0.8 && Math.abs(w) > 0.08) looks.push({ id: a.id, label: a.label, group: a.group, weight: w, sure: Math.min(1, Math.abs(w / sd) / 3) }) })
  looks.sort((a, b) => Math.abs(b.weight) * b.sure - Math.abs(a.weight) * a.sure)
  return { looks: looks.slice(0, 10), n: signals.length, words: words.slice(0, 12), counts, oldest: signals.length ? signals[signals.length - 1].t : null, categories: cats, top, bottom, traits: traits.slice(0, 8), styles, enough: signals.length >= 8 }
}
