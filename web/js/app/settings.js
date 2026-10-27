// @ts-check
import { html, useState, useEffect, useCtl, gb, phase, Pill, Ghost, Heading, Bar, Chip, CategoryPicker, Confirm, cap, Brand } from './ui.js'
import { Hardware, ModelList, ConfirmDelete, askDelete } from './models-ui.js'
import { post } from './api.js'
import { Learned } from './learned.js'
import { Readers } from './readers.js'

const SECTIONS = ['Model', 'Pictures', 'Categories', 'What it learned', 'Sound', 'Data']
const Title = ({ title, body }) => html`<h1>${title}</h1>${body && html`<p class="sub">${body}</p>`}`

/**
 * Everything the person can change, in one place with a list of sections on the left. What changes the pictures (the model's own settings, the picture size) is applied with one
 * button, because it redraws the mosaic; the categories apply to a fresh mosaic, which is offered when leaving. Choosing a model goes back to the mosaic at once: the change goes
 * on there (see the status pill).
 */
export const Settings = ({ c, user, store, atlas, world, start = 'Model', onRebuild, onClose }) => {
  useCtl(c)
  const [section, setSection] = useState(start)
  const [size, setSize] = useState(user.imageSize), [applied, setApplied] = useState(user.imageSize)
  const [edits, setEdits] = useState(/** @type {Record<string, number>} */ ({})), [applying, setApplying] = useState(false)
  const [sound, setSound] = useState(user.sound), [raw, setRaw] = useState(user.rawSteps)
  const [favs, setFavs] = useState(new Set(user.favs)), [hidden, setHidden] = useState(new Set(user.hidden))
  const [favs0] = useState(new Set(user.favs)), [hidden0] = useState(new Set(user.hidden))
  const [mode, setMode] = useState(0), [catNote, setCatNote] = useState(/** @type {string|null} */ (null)), [note, setNote] = useState(/** @type {string|null} */ (null))
  const [ask, setAsk] = useState('none'), [toDelete, setToDelete] = useState(/** @type {any} */ (null)), [stopped, setStopped] = useState(false)
  const s = c.state, active = c.active
  useEffect(() => setEdits({}), [active?.id])
  const changed = active ? Object.fromEntries(Object.entries(edits).filter(([k, v]) => Math.abs(v - (active.values[k] ?? v)) > 1e-6)) : {}
  const hasChanged = Object.keys(changed).length > 0
  const picturesPending = !applying && (hasChanged || size !== applied)
  const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x))
  const catsChanged = !same(favs, favs0) || !same(hidden, hidden0)
  useEffect(() => { if (applying && !hasChanged) { setEdits({}); setApplying(false) } }, [applying, hasChanged])          // the engine now reports the chosen values
  useEffect(() => { if (!applying) return; const t = setTimeout(() => { setEdits({}); setApplying(false) }, 6000); return () => clearTimeout(t) }, [applying])        // it never did (an error): show what it has

  const apply = () => {
    if (size !== applied) { setApplied(size); user.imageSize = size; user.save() }
    store.size = Math.max(size, active?.min_size ?? 256)
    if (active && hasChanged) { setApplying(true); c.setParams(active.id, changed) } else { c.resetPictures(); setEdits({}) }
  }
  const discard = () => { setEdits({}); setSize(applied) }
  const afterPictures = () => (catsChanged ? setAsk('cats') : onClose())
  const tryClose = () => { if (picturesPending) setAsk('pictures'); else if (catsChanged) setAsk('cats'); else onClose() }
  useEffect(() => { const f = e => { if (e.key === 'Escape' && ask === 'none' && !toDelete) tryClose() }; addEventListener('keydown', f); return () => removeEventListener('keydown', f) })

  const toggleCat = cat => {
    const nf = new Set(favs), nh = new Set(hidden), name = cap(cat)
    if (mode === 0) { if (nf.has(cat)) nf.delete(cat); else { if (nh.delete(cat)) setCatNote(`“${name}” was hidden: it moved to Favourites.`); nf.add(cat) } }
    else { if (nh.has(cat)) nh.delete(cat); else { if (nf.delete(cat)) setCatNote(`“${name}” was a favourite: it moved to Hidden.`); nh.add(cat) } }
    setFavs(nf); setHidden(nh); user.favs = [...nf]; user.hidden = [...nh]; user.save()
  }

  const model = () => !s ? html`<div class="faint">Looking at this computer…</div>` : html`
    <${Hardware} s=${s} />
    ${c.error && html`<div class="err" style="margin-top:12px;cursor:pointer" onClick=${() => c.dismissError()}>${c.error}</div>`}
    ${active && active.params.length > 0 && html`<${Heading}>Tuning ${active.name}<//>
      ${active.params.map(p => { const v = edits[p.id] ?? active.values[p.id] ?? p.default; return html`<div class="param"><div class="row between"><span>${p.label}</span><b>${p.step >= 1 ? Math.trunc(v) : v.toFixed(1)}</b></div>
        <input type="range" min=${p.min} max=${p.max} step=${p.step} value=${v} onInput=${e => setEdits({ ...edits, [p.id]: Math.round(+e.target.value * 100) / 100 })} />
        ${p.help && html`<div class="faint small">${p.help}</div>`}</div>` })}
      <button class="link" onClick=${() => setEdits(Object.fromEntries(active.params.map(p => [p.id, p.default])))}>Reset to the model's defaults</button>
      <div class="faint small">Each combination of settings keeps its own pictures: going back to an earlier one finds them again.</div>`}
    <${Heading}>Models<//>
    <${ModelList} c=${c} onChoose=${m => { c.use(m.id); if (m.installed) tryClose() }} onAskDelete=${askDelete(c, setToDelete)} />`

  const minSize = active?.min_size ?? 256
  const pictures = () => html`<${Title} title="Pictures" body="How big the pictures are made, and what you see while one is being drawn." />
    <div>Size: ${size} px</div>
    <div class="chips" style="margin-top:8px">${[256, 384, 512, 640, 768].map(px => html`<${Chip} on=${size === px} dim=${px < minSize} onClick=${() => setSize(px)}>${px}<//>`)}</div>
    ${active && minSize > size && html`<div class="warn small" style="margin-top:8px">${active.name} cannot make pictures smaller than ${minSize} px (they come out broken), so it uses ${minSize} while it is in use.</div>`}
    <div class="faint small" style="margin-top:6px">Smaller pictures are made and loaded faster, larger ones are sharper. The SDXL models (SDXL-Turbo, RealVisXL, DreamShaper XL) gain from 640 or 768 but take about twice as long. The mosaic always fills the cell. Applying redraws the mosaic.</div>
    <${Heading}>While a picture is drawn<//>
    <label class="switch"><input type="checkbox" checked=${raw} onChange=${e => { setRaw(e.target.checked); user.rawSteps = e.target.checked; store.rawSteps = e.target.checked; user.save() }} /><span class="track"></span><span>Show the real noise instead of the estimated picture</span></label>
    <div class="faint small" style="margin-top:6px">The centre picture shows each step as it is drawn. These models start from pure noise and clean it up: by default you see their estimate of the finished picture at each step; with this on you see the noise itself, which stays static until the last steps.</div>
    <${Readers} c=${c} user=${user} store=${store} />`

  const categories = () => html`<${Title} title="Categories" body="What the mosaic shows. Favourites steer where it starts and what appears around it; hidden categories never appear." />
    <div class="chips"><${Chip} on=${mode === 0} onClick=${() => { setMode(0); setCatNote(null) }}>Favourites (${favs.size})<//><${Chip} on=${mode === 1} onClick=${() => { setMode(1); setCatNote(null) }}>Hidden (${hidden.size})<//></div>
    <div class="faint small" style="margin-top:10px">${mode === 0 ? 'Tap to mark what you like.' : 'Tap to hide what you never want to see.'}</div>
    <${CategoryPicker} categories=${atlas.categoryNames} selected=${mode === 0 ? favs : hidden} dimmed=${mode === 0 ? hidden : favs} toggle=${toggleCat} />
    ${catNote && html`<div class="muted small" style="margin-top:14px">${catNote}</div>`}
    <div class="faint small" style="margin:18px 0 12px">Changes apply to a fresh mosaic: the one on screen stays as it is until you start a new one.</div>
    <${Pill} disabled=${!catsChanged} onClick=${onRebuild}>Start a fresh mosaic now<//>`

  const soundSec = () => html`<${Title} title="Sound" />
    <label class="switch"><input type="checkbox" checked=${sound} onChange=${e => { setSound(e.target.checked); user.sound = e.target.checked; user.save() }} /><span class="track"></span><span>Soft ticks while the mosaic moves</span></label>`

  const data = () => html`<${Title} title="Data" body="What you chose, looked at and saved is kept in this folder, on this computer only." />
    <div class="muted small">${c.dataDir || '…'}</div>
    <${Heading}>What the app learned<//>
    <p class="muted">The mosaic drifts towards what you stayed on. You can make it forget that: your saved pictures and choices stay.</p>
    <${Ghost} onClick=${() => setAsk('forget')}>Forget what the app learned<//>
    ${note && html`<div class="muted small" style="margin-top:10px">${note}</div>`}
    <${Heading}>Phosphene<//>
    <p class="muted">Closing this tab leaves the engine running (and the graphics card in use). Quit stops it.</p>
    <${Ghost} onClick=${() => setAsk('quit')}>Quit Phosphene<//>`

  return html`<div class="screen settings">
    <div class="side"><div style="padding:0 12px 14px"><${Brand} /></div><button class="back" onClick=${tryClose}>←  Back</button><h2>Settings</h2>
      ${SECTIONS.map(n => html`<button class=${'navitem' + (n === section ? ' on' : '')} onClick=${() => setSection(n)}>${n}</button>`)}</div>
    <div class="main"><div class="content">${section === 'Model' ? html`<${Title} title="Model" body="The model that makes the pictures, and what you can tune on it." />${model()}` : section === 'Pictures' ? pictures() : section === 'Categories' ? categories() : section === 'What it learned' ? html`<${Learned} user=${user} world=${world} atlas=${atlas} store=${store} vocab=${c.reader?.vocab ?? []} />` : section === 'Sound' ? soundSec() : data()}</div></div>
    ${picturesPending && html`<div class="applybar"><span>Picture settings changed. Applying redraws the mosaic.</span><${Ghost} onClick=${discard}>Discard<//><${Pill} onClick=${apply}>Apply<//></div>`}
    ${s && (c.loading || c.downloading) && html`<div class="statusline">${c.downloading ? html`<div>Downloading ${c.downloading.name}: ${gb(c.downloading.job.done / 1048576)} of ${gb(c.downloading.job.total / 1048576)}</div><${Bar} frac=${c.downloading.job.total > 0 ? c.downloading.job.done / c.downloading.job.total : null} thin />` : html`<div>${phase(s.activation.message)}…</div>`}</div>`}
    ${ask === 'pictures' && html`<${Confirm} title="Apply your picture settings?" body="They redraw the mosaic with the new settings." yes="Apply" no="Discard" onYes=${() => { setAsk('none'); apply(); afterPictures() }} onNo=${() => { setAsk('none'); discard(); afterPictures() }} />`}
    ${ask === 'cats' && html`<${Confirm} title="Start a fresh mosaic with your new categories?" body="The one on screen stays as it is until then. You can do it later from Categories." yes="Start fresh" no="Later" onYes=${() => { setAsk('none'); onRebuild() }} onNo=${() => { setAsk('none'); onClose() }} />`}
    ${ask === 'forget' && html`<${Confirm} title="Forget what the app learned?" body="The next mosaic starts without what it learned from your viewing. Saved pictures and your choices stay." yes="Forget" no="Keep it" onYes=${() => { setAsk('none'); user.forgetLearning(); setNote('Done: the next mosaic starts without that history.') }} onNo=${() => setAsk('none')} />`}
    ${ask === 'quit' && html`<${Confirm} title="Quit Phosphene?" body="This stops the engine and frees the graphics card. To use Phosphene again, start it again from the launcher." yes="Quit" no="Keep running" onYes=${async () => { setAsk('none'); user.flush(); try { await post('/quit') } catch { } setStopped(true) }} onNo=${() => setAsk('none')} />`}
    ${toDelete && html`<${ConfirmDelete} m=${toDelete} onYes=${() => { c.delete(toDelete.id); setToDelete(null) }} onNo=${() => setToDelete(null)} />`}
    ${stopped && html`<div class="scrim"><div class="dialog"><h3>Phosphene has stopped</h3><p>You can close this tab.</p></div></div>`}
  </div>`
}
