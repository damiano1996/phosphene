// @ts-check
import { models as fetchModels, post } from './api.js'

/**
 * The one place that brings a model into use: download it if need be, load it, then tell the app. It lives as long as the page does, so a choice goes on while the person
 * looks at something else (the first screens, or the mosaic). The screens only show its state and call its actions.
 */
export class ModelsController {
  /** @param {import('./user.js').UserData} user @param {{onReady: (changed: boolean) => void, onSize: (n: number) => void, onReset: () => void, getKey: () => string, refreshKey: () => Promise<void>}} hooks */
  constructor(user, hooks) {
    this.user = user; this.hooks = hooks
    /** @type {any} */ this.state = null
    /** @type {string|null} */ this.target = null; /** @type {string|null} */ this.error = null; /** @type {string|null} */ this.notice = null
    this.armed = false; this.activating = false; this.retryAt = 0; this.listeners = new Set(); this.alive = true; this.dataDir = ''
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit() { for (const f of this.listeners) f() }
  set(patch) { Object.assign(this, patch); this.emit() }

  get targetCard() { return this.target ? this.state?.models.find(m => m.id === this.target) ?? null : null }
  /** 'idle' | 'download' | 'load' | 'ready' */
  get stage() {
    const m = this.targetCard; if (!m) return 'idle'; const s = this.state; if (!s) return 'download'
    return !m.installed ? 'download' : m.active && s.activation.phase === 'ready' ? 'ready' : 'load'
  }
  /** 0..1 of the download of the model being brought into use, or null when it is not a download (or the size is unknown). */
  get downloadFraction() { const m = this.targetCard; return m && m.job?.state === 'downloading' && m.job.total > 0 ? Math.min(1, Math.max(0, m.job.done / m.job.total)) : null }
  get active() { return this.state?.models.find(m => m.active) ?? null }
  get downloading() { return this.state?.models.find(m => m.job?.state === 'downloading') ?? null }
  get loading() { const p = this.state?.activation.phase; return p === 'loading' || p === 'encoding' }

  nice(m) { return !m || m.startsWith("'") ? 'That model is not in the list.' : m }

  use(id) {
    this.error = null; this.notice = null; this.activating = false; this.armed = false; this.target = id; this.emit()
    const installed = this.state?.models.find(m => m.id === id)?.installed === true
    ;(async () => {
      if (!installed) { try { await post(`/models/install?id=${id}`) } catch (e) { this.set({ error: this.nice(String(e.message)), target: null }) } }
      this.armed = true
    })()
  }
  /** Takes over a model the engine is already loading (or has loaded) without asking for it again: just waits for it. */
  adopt(id) { this.error = null; this.notice = null; this.target = id; this.armed = true; this.activating = true; this.emit() }
  /** The model the engine is busy with or has ready: loading first, else the one in use. */
  get engineModel() { const a = this.state?.activation; if (a && (a.phase === 'loading' || a.phase === 'encoding') && a.model) return a.model; return this.active?.id ?? null }

  dismissError() { this.set({ error: null }) }
  async delete(id) { try { await post(`/models/delete?id=${id}`) } catch (e) { this.set({ error: String(e.message) }) } }
  /** Checks a Hugging Face link and adds it to the list; resolves to the message to show. */
  async add(link) {
    try { await post('/models/add?repo=' + encodeURIComponent(link)); return 'Added to the list. Choose it there to download it.' } catch (e) { return String(e.message) || 'Could not add it' }
  }
  /** The reader of pictures: download it, turn it on (on the graphics card, the processor, or wherever there is room), turn it off. */
  async installReader(id) { try { await post(`/models/install?id=${id}`) } catch (e) { this.set({ error: String(e.message) }) } }
  async readerOn(id, device = 'auto') { try { await post(`/captioner/activate?id=${id}&device=${device}`) } catch (e) { this.set({ error: String(e.message) }) } }
  async readerOff() { try { await post('/captioner/off') } catch (e) { this.set({ error: String(e.message) }) } }
  get reader() { return this.state?.captioner ?? null }
  /** Applies new values of the model's own settings (all at once: the pictures are redrawn once), then drops what was drawn with the old ones. */
  async setParams(id, values, reset = false) {
    try {
      if (reset) await post(`/models/params?id=${id}&reset=1`)
      if (Object.keys(values).length) await post(`/models/params?id=${id}&` + Object.entries(values).map(([k, v]) => `${k}=${v}`).join('&'))
      await this.hooks.refreshKey()
    } catch (e) { this.set({ error: String(e.message) }) }
    this.hooks.onReset()
  }
  resetPictures() { this.hooks.onReset() }

  /** Looks at the engine all the time (faster while something is going on) and moves the chosen model on one step at a time. */
  async poll() {
    while (this.alive) {
      try { const s = await fetchModels(); this.state = s; this.dataDir = s.data_dir ?? ''; await this.step(s); this.emit() } catch { }
      await new Promise(r => setTimeout(r, this.target || this.downloading || this.loading ? 500 : 1500))
    }
  }
  async step(s) {
    const id = this.target; if (!id || !this.armed || Date.now() < this.retryAt) return
    const m = s.models.find(x => x.id === id); if (!m) { this.target = null; return }
    if (m.job?.state === 'error') { this.error = m.job.message; this.target = null }
    else if (this.activating && s.activation.failed?.model === id) { this.error = this.nice(String(s.activation.failed.message)); this.target = null; this.activating = false }          // the engine could not switch and is back on the model that was in use
    else if (m.active && s.activation.phase === 'ready') {
      const old = this.hooks.getKey(); await this.hooks.refreshKey(); const changed = this.hooks.getKey() !== old
      this.user.model = id; this.user.save(); this.target = null; this.notice = `Now using ${m.name}`
      this.hooks.onSize(Math.max(this.user.imageSize, m.min_size ?? 256)); this.hooks.onReady(changed)
    } else if (this.activating && s.activation.phase === 'error' && s.activation.model === id) { this.error = s.activation.message; this.target = null; this.activating = false }
    else if (m.installed && !this.activating && m.job?.state !== 'downloading') {
      this.activating = true
      try { await post(`/models/activate?id=${id}`) }
      catch (e) {
        if (/already being loaded/.test(String(e.message))) { this.activating = false; this.retryAt = Date.now() + 3000 }          // the engine is busy loading a model: not a failure, ask again in a moment
        else { this.error = this.nice(String(e.message)); this.target = null; this.activating = false }
      }
    }
  }
}
