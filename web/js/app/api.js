// @ts-check
/** The engine, over HTTP on the same address as this page (the cookie set by the first visit is the key). */

async function check(r) { if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(t || `HTTP ${r.status}`) } return r }
export const getJSON = async p => (await check(await fetch(p))).json()
export const getText = async p => (await check(await fetch(p))).text()
export const post = async p => (await check(await fetch(p, { method: 'POST' }))).text()

/** The key of the model now loaded ("" when none): every image request carries it. */
export async function health() { return getJSON('/health') }
export const models = () => getJSON('/models')
/** `keepalive` (a request that outlives the page) is refused by browsers above 64 KiB: the learned signals make the file bigger than that, and then it must go as an ordinary request. */
/** The epoch of the engine's data folder, from when the page read the person's data: saves carry it, so a page that outlives a reset of the data cannot write its old state back over it. */
let epoch = ''
export const getUser = async () => { const r = await check(await fetch('/user')); epoch = r.headers.get('X-Epoch') ?? ''; return r.json() }
export const putUser = async body => {
  const r = await fetch('/user', { method: 'PUT', body, headers: { 'Content-Type': 'application/json', 'X-Epoch': epoch }, keepalive: body.length < 60000 })
  if (r.status === 409) { location.reload(); throw new Error('the data was reset: reloading') }
  if (!r.ok) throw new Error('could not save: HTTP ' + r.status); return r
}
export const quit = () => post('/quit')
