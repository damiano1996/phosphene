// @ts-check
/**
 * Hooks for tests and recordings. Nothing in the app reads them back except `worldSeed`, so they change no behaviour:
 *   window.__worldSeed   a whole number: the mosaic starts from this seed, so that it starts the same way twice (set before the page's scripts run)
 *   window.__scene()     the current Scene (its world, cells, buttons)           window.__store   the ImageStore (pictures, previews, readings)
 *   window.__c           the ModelsController                                    window.__user    the person's data
 *   window.__fps         frames per second, measured once a second
 */
export function worldSeed() {
  return typeof window !== 'undefined' && Number.isInteger(/** @type {any} */ (window).__worldSeed) ? /** @type {any} */ (window).__worldSeed : Math.max(1, Math.floor(Math.random() * 0x7fffffff))
}

/** @param {Window} w @param {{scene: () => any, store: any, controller: any, user: any}} parts */
export function exposeForTests(w, { scene, store, controller, user }) {
  const x = /** @type {any} */ (w)
  x.__scene = scene; x.__store = store; x.__c = controller; x.__user = user; x.__fps = 0
  return fps => { x.__fps = fps }
}
