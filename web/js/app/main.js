// @ts-check
import { html, render, useState, useEffect } from '../../vendor/preact-htm.js'
import { Atlas } from '../core/atlas.js'
import { getText, getJSON } from './api.js'
import { UserData } from './user.js'
import { ImageStore } from './images.js'
import { Scene } from './scene.js'
import { newWorld } from './new-world.js'
import { attachInput } from './input.js'
import { exposeForTests } from './testing.js'
import { Facets } from '../core/facets.js'
import { Asmr } from './sound.js'
import { ModelsController } from './controller.js'
import { FirstModel, StatusPill } from './models-ui.js'
import { Categories, Prepare } from './screens.js'
import { Settings } from './settings.js'
import { Gallery } from './gallery.js'
import { Splash, useCtl } from './ui.js'

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('stage'))
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
const bus = new EventTarget()
const w = /** @type {any} */ (window)

/** The page: first run (model, categories, preparing), then the mosaic with the settings and the saved pictures over it. */
function App({ atlas, user, store, c, build, cur }) {
  useCtl(c)
  const [chosen, setChosen] = useState(user.model), [onboarded, setOnboarded] = useState(user.onboarded), [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(false), [gallery, setGallery] = useState(/** @type {number|null} */ (null)), [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const on = (name, f) => { bus.addEventListener(name, f); return () => bus.removeEventListener(name, f) }
    const offs = [on('ready', () => setReady(true)), on('settings', () => setSettings(true)), on('saved', e => setGallery(/** @type {CustomEvent} */ (e).detail))]
    return () => offs.forEach(f => f())
  }, [])
  useEffect(() => { if (ready && onboarded) build() }, [ready, onboarded, epoch])          // the mosaic starts from the favourites: it must wait for the choice of categories (the model may be ready before it)
  useEffect(() => { cur.overlay = settings || gallery != null }, [settings, gallery])
  // A model that cannot be brought into use before the mosaic exists: back to the choice, with the reason on it.
  useEffect(() => { if (!ready && c.error) { setChosen(null); user.model = null; user.save() } }, [ready, c.error])
  // No model chosen here, but the engine is loading or has one: go on with that one (a reload while a model is loading, or a model chosen in another window).
  useEffect(() => { if (chosen == null && !ready && c.engineModel && !c.target) { const id = c.engineModel; user.model = id; user.save(); setChosen(id); c.adopt(id) } }, [chosen, ready, c.state])
  useEffect(() => { if (!c.notice) return; const t = setTimeout(() => c.set({ notice: null }), 4000); return () => clearTimeout(t) }, [c.notice])

  if (chosen == null && !ready) return html`<${FirstModel} c=${c} onChoose=${m => { user.model = m.id; user.save(); setChosen(m.id); c.use(m.id) }} />`
  if (!onboarded) return html`<${Categories} c=${c} atlas=${atlas} onDone=${favs => { user.favs = favs; user.onboarded = true; user.save(); setOnboarded(true) }} />`
  if (!ready) return html`<${Prepare} c=${c} />`
  return html`${c.active && !settings && html`<div class="modeltag">${c.active.name}</div>`}${gallery != null && html`<${Gallery} user=${user} store=${store} openAt=${gallery} onClose=${() => setGallery(null)} />`}
    ${settings ? html`<${Settings} c=${c} user=${user} store=${store} atlas=${atlas} world=${cur.scene?.world} onRebuild=${() => { setEpoch(epoch + 1); setSettings(false) }} onClose=${() => setSettings(false)} />` : html`<${StatusPill} c=${c} />`}`
}

async function boot() {
  const atlas = Atlas.parse(await getText('/atlas.tsv'))
  const user = await UserData.load(atlas.version)
  const facets = await getText('/facets.json').then(Facets.parse, () => null)          // the finer kinds of each concept; the page works without them
  if (facets) await getJSON('/attrs').then(a => facets.setAttrs(a.attrs, a.nature, a.capacity), () => { })          // the engine's list of attributes (it grows), the master
  const store = new ImageStore(); store.size = user.imageSize; store.rawSteps = user.rawSteps
  const sound = new Asmr(); sound.enabled = user.sound
  /** @type {{scene: Scene|null, overlay: boolean}} */ const cur = { scene: null, overlay: false }
  user.onForget = () => cur.scene?.world.model.clear()
  const c = new ModelsController(user, {
    onReady: changed => { if (changed) store.reset(); bus.dispatchEvent(new Event('ready')) },
    onSize: n => { store.size = n }, onReset: () => store.reset(), getKey: () => store.key, refreshKey: () => store.refreshKey(),
  })
  c.subscribe(() => {
    store.steps = Math.trunc(c.active?.values?.steps ?? 0); sound.enabled = user.sound; store.rawSteps = user.rawSteps
    const r = c.reader, mode = r && c.state.captioners.find(x => x.id === r.id)?.mode           // a tagger is cheap enough to read every picture; a language model reads the centre one by default
    store.reader.on = !!r && r.phase === 'ready' && !!r.id; store.reader.scope = user.readerScope === 'all' || user.readerScope === 'centre' ? user.readerScope : (mode === 'caption' ? 'centre' : 'all')
  })
  const build = () => {            // a fresh mosaic: a new world, from where the favourites and what was liked suggest
    const shown = atlas.without(new Set(user.hidden)), use = shown.size >= 40 ? shown : atlas      // hiding nearly everything is ignored: there would be nothing to look at
    cur.scene = new Scene(newWorld(use, atlas, user, c.reader?.vocab?.length ?? 0, facets), use, atlas, store, user, {
      openSettings: () => bus.dispatchEvent(new Event('settings')), openSaved: i => bus.dispatchEvent(new CustomEvent('saved', { detail: i })),
      tick: (speed, now) => sound.tick(speed, now), settle: () => sound.settle(),
    })
  }
  attachInput(canvas, () => cur.scene)
  const setFps = exposeForTests(w, { scene: () => cur.scene, store, controller: c, user })
  let frames = 0, t0 = performance.now(), dpr = 1
  const resize = () => { dpr = devicePixelRatio || 1; canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr) }
  resize(); addEventListener('resize', resize)
  const loop = now => {
    if (cur.scene) cur.scene.suspended = cur.overlay
    if (cur.scene) cur.scene.render(ctx, canvas.width, canvas.height, dpr, now); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    frames++; if (now - t0 >= 1000) { setFps(frames * 1000 / (now - t0)); frames = 0; t0 = now }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { cur.scene?.endDwell(); cur.scene?.world.flushDwell(); user.flush() } }); addEventListener('pagehide', () => user.flush())
  if (user.model) c.use(user.model)          // the model chosen on an earlier run is loaded again
  c.poll()
  render(html`<${App} atlas=${atlas} user=${user} store=${store} c=${c} build=${build} cur=${cur} />`, document.getElementById('screens'))
}
render(html`<${Splash} title="Starting" subtitle="Getting the engine ready." steps=${[{ label: 'Start the engine', state: 'active' }]} />`, document.getElementById('screens'))
boot().catch(e => { document.getElementById('screens').textContent = 'Could not start: ' + e })
