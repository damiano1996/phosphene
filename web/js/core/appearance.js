// @ts-check
/**
 * What a picture looks like, in a handful of numbers, so the model can learn what a person likes about it and not only what it shows: the colours, the light, the detail,
 * how the picture is put together, and which of the engine's three prompt styles drew it. Measured on a small copy of the finished picture, in the browser, and kept as numbers
 * (never the picture) in the signals.
 */
export const STYLE_BY_SEED = [0, 0, 0, 0, 1, 1, 1, 2]                 // the engine's table (engine/atlas.py): template 0 photo, 1 close-up photo, 2 painting
export const STYLE_NAMES = ['photo', 'close-up photo', 'painting']
/** The measured traits, in order; then one slot per style. */
export const AP_TRAITS = ['light', 'contrast', 'saturation', 'colourful', 'warm', 'hue_x', 'hue_y', 'detail', 'symmetry', 'centre', 'sky', 'dark', 'bright']
/** The measured traits and the style slots; a reader of pictures (words about them) adds one more slot per word of its vocabulary after these. */
export const AP_BASE = AP_TRAITS.length + STYLE_NAMES.length
export const AP_DIM = AP_BASE
export const styleOf = seed => STYLE_BY_SEED[seed % STYLE_BY_SEED.length]

/** The style of a cell is known from its seed alone, before any picture exists; the measured traits are NaN until there is one. */
export function styleOnly(seed) { const a = new Float64Array(AP_DIM).fill(NaN); for (let s = 0; s < STYLE_NAMES.length; s++) a[AP_TRAITS.length + s] = styleOf(seed) === s ? 1 : 0; return a }

/**
 * @param {ArrayLike<number>} data RGBA bytes of a w x h copy of the picture (about 48 x 48) @param {number} w @param {number} h @param {number} seed
 * @returns {Float64Array} the traits (and the style of `seed`)
 */
export function appearanceOf(data, w, h, seed) {
  const n = w * h, L = new Float64Array(n), S = new Float64Array(n); let sumL = 0, sumS = 0, hx = 0, hy = 0, rg = [], yb = [], warm = 0, dark = 0, bright = 0
  for (let i = 0; i < n; i++) {
    const r = data[4 * i] / 255, g = data[4 * i + 1] / 255, b = data[4 * i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = 0.299 * r + 0.587 * g + 0.114 * b, s = mx === 0 ? 0 : (mx - mn) / mx
    L[i] = l; S[i] = s; sumL += l; sumS += s; warm += r - b; if (l < 0.18) dark++; if (l > 0.85) bright++
    if (mx > mn) { let hue; const d = mx - mn; if (mx === r) hue = ((g - b) / d) % 6; else if (mx === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4; const a = hue * Math.PI / 3; hx += s * Math.cos(a); hy += s * Math.sin(a) }
    rg.push(r - g); yb.push(0.5 * (r + g) - b)
  }
  const meanL = sumL / n; let varL = 0; for (let i = 0; i < n; i++) varL += (L[i] - meanL) ** 2
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }, mean = a => a.reduce((x, y) => x + y, 0) / a.length
  // detail: mean gradient; and how much of it is in the middle of the picture compared with the whole (a subject in the centre)
  let edge = 0, edgeCentre = 0, cn = 0
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, g = Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + w] - L[i]); edge += g
    if (x >= w / 4 && x < 3 * w / 4 && y >= h / 4 && y < 3 * h / 4) { edgeCentre += g; cn++ }
  }
  const edgeAll = edge / ((w - 1) * (h - 1)), edgeMid = cn ? edgeCentre / cn : edgeAll
  let sym = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) sym += Math.abs(L[y * w + x] - L[y * w + (w - 1 - x)]); sym = 1 - sym / (h * (w / 2))
  let top = 0, bot = 0; for (let x = 0; x < w; x++) for (let y = 0; y < h / 3; y++) { top += L[y * w + x]; bot += L[(h - 1 - y) * w + x] } const third = w * Math.floor(h / 3)
  const out = styleOnly(seed)
  out[0] = meanL; out[1] = Math.sqrt(varL / n); out[2] = sumS / n
  out[3] = Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2)           // Hasler and Susstrunk's colourfulness
  out[4] = warm / n; out[5] = hx / n; out[6] = hy / n
  out[7] = edgeAll; out[8] = sym; out[9] = edgeAll > 1e-6 ? edgeMid / edgeAll : 1; out[10] = (top - bot) / third
  out[11] = dark / n; out[12] = bright / n
  return out
}
