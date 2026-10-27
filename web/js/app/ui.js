// @ts-check
import { html, useState, useEffect, useMemo, useRef } from '../../vendor/preact-htm.js'
export { html, useState, useEffect, useMemo, useRef }

/** Re-renders the component whenever the controller says its state changed. */
export function useCtl(c) { const [, set] = useState(0); useEffect(() => c.subscribe(() => set(n => n + 1)), [c]); return c }

export const gb = mb => (mb / 1024).toFixed(1) + ' GB'
/** A status line from the engine, without a trailing ellipsis (the screens add their own, once). */
export const phase = msg => (msg ?? '').replace(/[….\s]+$/, '')

/** The main action: a dark pill. Disabled it is grey and does nothing. */
export const Pill = ({ children, onClick, disabled }) => html`<button class="pill" disabled=${disabled} onClick=${onClick}>${children}</button>`
/** A quiet action: an outlined pill. */
export const Ghost = ({ children, onClick }) => html`<button class="ghost" onClick=${onClick}>${children}</button>`
export const Tag = ({ children, dark }) => html`<span class=${'tag' + (dark ? ' dark' : '')}>${children}</span>`
export const Heading = ({ children }) => html`<h4 class="heading">${children}</h4>`
/** Progress; with no value known, a segment sliding along (something is happening, it is not known how long it takes). */
export const Bar = ({ frac, thin }) => html`<div class=${'bar' + (thin ? ' thin' : '')}>${frac == null ? html`<div class="slide"></div>` : html`<div class="fill" style=${{ width: Math.max(0, Math.min(1, frac)) * 100 + '%' }}></div>`}</div>`
export const Chip = ({ on, dim, onClick, children }) => html`<button class=${'chip' + (on ? ' on' : '') + (dim ? ' dim' : '')} onClick=${onClick}>${children}</button>`
/** The logo: the sunflower spiral of the app icon. */
export const Logo = ({ size = 28, spin }) => html`<img class=${'logo' + (spin ? ' spin' : '')} src="logo.svg" width=${size} height=${size} alt="" />`
export const Brand = () => html`<div class="brandrow"><${Logo} size=${26} /><span class="brand">PHOSPHENE</span></div>`
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// Categories that are not listed here (a new one in the atlas) still show up, under "More".
const SECTIONS = [
  ['Make and craft', ['painting and drawing', 'illustration and graphic design', 'sculpture', 'ceramics and pottery', 'textile and fiber crafts', 'woodworking and diy', 'paper and lettering', 'art and pattern', 'miniatures and models']],
  ['Style and beauty', ['fashion and outfits', 'accessories and jewelry', 'hair and beauty', 'tattoos', 'costume and cosplay']],
  ['Home and spaces', ['interior design and decor', 'gardens and landscaping', 'architecture and design', 'houses', 'interiors', 'city and monuments']],
  ['Food and gatherings', ['food and drink', 'baking and plating', 'weddings and events', 'festivals']],
  ['Nature and animals', ['flowers', 'plants and forests', 'mammals', 'birds', 'sea life', 'insects and fungi', 'landscapes', 'sky and weather']],
  ['Machines and motion', ['motorbikes and bicycles', 'cars and trucks', 'air rail and water transport', 'energy and industry', 'sport and outdoors']],
  ['Imagination and objects', ['fantasy and sci-fi', 'microscopic and cosmic', 'textures', 'objects', 'people at work', 'photography styles']],
]
export function sections(categories) {
  const remaining = new Set(categories), out = []
  for (const [title, members] of SECTIONS) { const here = members.filter(m => remaining.has(m)); if (here.length) { here.forEach(m => remaining.delete(m)); out.push([title, here]) } }
  if (remaining.size) out.push(['More', [...remaining]])
  return out
}
/** The categories, grouped by theme: the same picker on the first screen and in the settings. `dimmed` ones are in another list (they move here when tapped). */
export const CategoryPicker = ({ categories, selected, dimmed = new Set(), toggle }) => html`${sections(categories).map(([title, members]) => html`
  <h4 class="heading small">${title}</h4>
  <div class="chips">${members.map(c => html`<${Chip} on=${selected.has(c)} dim=${dimmed.has(c)} onClick=${() => toggle(c)}>${cap(c)}<//>`)}</div>`)}`

/** A question that needs an answer before going on, over a dimmed screen. (Never window.confirm: a page-level dialog would block everything.) */
export const Confirm = ({ title, body, yes, no, onYes, onNo }) => html`
  <div class="scrim" onClick=${e => e.stopPropagation()}><div class="dialog" role="dialog" aria-modal="true">
    <h3>${title}</h3><p>${body}</p><div class="row"><${Pill} onClick=${onYes}>${yes}<//><${Ghost} onClick=${onNo}>${no}<//></div>
  </div></div>`

/** A waiting screen that says what is happening and what comes next, instead of one line of text. steps: [{label, state: 'todo'|'active'|'done', progress, detail}] */
export const Splash = ({ title, subtitle, steps }) => html`
  <div class="screen center"><div class="splash">
    <${Logo} size=${76} spin /><div class="brand" style="margin-top:14px">PHOSPHENE</div><h1>${title}</h1><p class="sub">${subtitle}</p>
    ${steps.map(s => html`<div class="step"><span class=${'dot ' + s.state}>${s.state === 'done' ? '✓' : ''}</span><div>
      <div class=${'steplabel ' + s.state}>${s.label}</div>
      ${s.state === 'active' && html`<${Bar} frac=${s.progress} thin />${s.detail && html`<div class="detail">${s.detail}</div>`}`}</div></div>`)}
  </div></div>`
