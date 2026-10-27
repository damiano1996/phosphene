// @ts-check
import { ViewingHistory } from '../core/history.js'
import { getUser, putUser, post } from './api.js'

/**
 * What belongs to the person using the app: the first-screen choices, what earlier launches liked, the saved pictures. It lives in one file on the engine's side
 * (so it is the same whichever browser or port is used, and clearing the browser does not lose it) and is written a moment after every change.
 */
export class UserData {
  /** @param {any} o @param {number} atlasVersion */
  constructor(o, atlasVersion) {
    this.atlasVersion = atlasVersion
    this.onboarded = !!o.onboarded
    this.favs = o.favs ?? []; this.hidden = o.hidden ?? []
    this.model = o.model ?? null
    this.imageSize = [256, 320, 384, 448, 512, 576, 640, 704, 768].includes(o.imageSize) ? o.imageSize : 512
    this.sound = o.sound !== false; this.rawSteps = !!o.rawSteps
    this.history = ViewingHistory.from(o.history)
    /** what the model has learned, as its observations (see PreferenceModel.toJSON), and the atlas they belong to */ this.learn = o.learnAtlas === atlasVersion ? (o.learn ?? null) : null
    /** the person has paused learning */ this.paused = !!o.paused
    /** where the reader of pictures runs: 'auto', 'gpu' or 'cpu' */ this.readerDevice = o.readerDevice ?? 'auto'
    /** what the reader of pictures reads: 'all', 'centre', or null for what suits the reader */ this.readerScope = o.readerScope ?? null
    /** called when everything learned is forgotten */ this.onForget = () => { }
    // Saved pictures are recipes (latent + seed) of one particular atlas; if the atlas has been rebuilt they would draw something else, so they are not loaded.
    /** @type {{z: number[], seed: number, v?: string, s?: number, id?: string}[]} */ this.saved = o.savedAtlas === atlasVersion ? (o.saved ?? []) : []
    this.timer = 0
  }
  static async load(atlasVersion) { let o = {}; try { o = await getUser() } catch { } return new UserData(o, atlasVersion) }

  toJSON() {
    return { onboarded: this.onboarded, favs: this.favs, hidden: this.hidden, model: this.model, imageSize: this.imageSize, sound: this.sound, rawSteps: this.rawSteps,
      history: this.history.toJSON(), saved: this.saved, savedAtlas: this.atlasVersion, learn: this.learn, learnAtlas: this.atlasVersion, paused: this.paused, readerScope: this.readerScope, readerDevice: this.readerDevice }
  }
  /** Writes soon (changes that come in a burst are one write). */
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400) }
  flush() { clearTimeout(this.timer); putUser(JSON.stringify(this)).catch(e => console.warn(String(e))) }

  /** A saved picture is the pixels as they were when it was saved (`id`: a file on the engine's side), because the same recipe drawn by another model is another picture.
   *  `v` is the version of the engine's pictures then (model and settings): a cell counts as saved only while it would be drawn the same way. */
  indexOf(z, seed, v) { return this.saved.findIndex(s => s.seed === seed && sameZ(s.z, z) && (!s.v || !v || s.v === v)) }
  has(z, seed, v) { return this.indexOf(z, seed, v) >= 0 }
  /** Newest first; null if it was already saved. The picture itself is copied by `persistImage`. */
  addSaved(z, seed, v, s) {
    if (this.has(z, seed, v)) return null
    const item = { z: Array.from(z), seed, v, s }; this.saved.unshift(item); if (this.saved.length > 300) this.saved.pop(); this.save(); return item
  }
  /** Asks the engine to keep this picture's pixels; until it has, the cell is drawn from its recipe. */
  async persistImage(item) {
    try { const r = JSON.parse(await post(`/saved/add?s=${item.s}&v=${encodeURIComponent(item.v ?? '')}&seed=${item.seed}&z=${item.z.map(x => x.toFixed(2)).join(',')}`)); item.id = r.id; this.save() }
    catch { const i = this.saved.indexOf(item); if (i >= 0) this.saved.splice(i, 1); this.save() }       // it could not be kept (the model changed under it, or the engine is gone)
  }
  removeSavedAt(i) {
    if (i < 0 || i >= this.saved.length) return
    const [it] = this.saved.splice(i, 1); this.save()
    if (it.id) post(`/saved/remove?id=${it.id}`).catch(() => { })
  }
  saveHistory() { this.save() }
  /** Forget what the app has learned from what you looked at (the saved pictures and your choices stay). */
  forgetLearning() { this.history = new ViewingHistory(); this.learn = null; this.onForget(); this.save() }
}
const sameZ = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
