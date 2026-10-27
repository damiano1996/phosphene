// @ts-check
import { html, useState, useEffect } from './ui.js'

/** The saved images as a grid. Click one to see it large (with a button to remove it); Esc or Back closes. */
export const Gallery = ({ user, store, openAt, onClose }) => {
  const [big, setBig] = useState(openAt), [count, setCount] = useState(user.saved.length)
  useEffect(() => { if (count === 0) onClose() }, [count])
  useEffect(() => { const f = e => { if (e.key === 'Escape') { if (big >= 0) setBig(-1); else onClose() } }; addEventListener('keydown', f); return () => removeEventListener('keydown', f) })
  const src = i => { const it = user.saved[i]; if (it.id) return `/saved/${it.id}.jpg`; return `/img?s=${store.size}&v=${encodeURIComponent(store.key)}&seed=${it.seed}&z=${it.z.map(v => v.toFixed(2)).join(',')}` }
  return html`<div class="screen gallery"><div class="gbar"><button class="back" onClick=${onClose}>←  Back</button><h2>Saved</h2></div>
    <div class="grid">${Array.from({ length: count }, (_, i) => user.saved[i] && html`<button class="thumb" onClick=${() => setBig(i)}><img src=${src(i)} alt="" loading="lazy" decoding="async" /></button>`)}</div>
    ${big >= 0 && big < count && html`<div class="bigscrim" onClick=${() => setBig(-1)}><div class="bigbox" onClick=${e => e.stopPropagation()}><div class="bigframe"><img src=${src(big)} alt="" /></div>
      <a class="whitelink" href=${src(big)} download=${'phosphene-' + user.saved[big].seed + '.jpg'}>Download</a>
      <button class="whitelink" onClick=${() => { user.removeSavedAt(big); setCount(user.saved.length); setBig(-1) }}>Remove from saved</button></div></div>`}</div>`
}
