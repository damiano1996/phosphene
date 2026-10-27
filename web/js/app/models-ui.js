// @ts-check
import { html, useState, useCtl, gb, Pill, Ghost, Tag, Heading, Bar, Confirm, Brand } from './ui.js'

const gpuLabel = s => (s.hardware.name ?? '').replace(' Laptop GPU', '').replace(' Generation', '')

/** What this computer can run, in one line (the model screens say it before the choice). */
export const Hardware = ({ s }) => {
  const hw = s.hardware
  return html`<div class="hardware">${hw.kind === 'cuda' || hw.kind === 'mps'
    ? html`<b>${gpuLabel(s)}</b><div>${gb(hw.total_mb)} of ${hw.kind === 'mps' ? 'memory the graphics chip can use (shared with the Mac)' : 'GPU memory'}, ${gb(hw.free_mb)} free right now</div>`
    : html`<b>No supported graphics card found</b><div>This version needs an NVIDIA GPU with its drivers installed, or a Mac with Apple Silicon.</div>`}</div>`
}

/**
 * One model. `action` is what the main button says for this model (the screens differ: "and continue" on the first one). Only one download runs at a time, so the buttons of
 * models that still need one wait while another is downloading.
 */
export const ModelCard = ({ m, c, recommended, action, hero, onChoose, onAskDelete }) => {
  const s = c.state, down = m.job?.state === 'downloading', mine = c.target === m.id
  const otherDownload = !m.installed && (c.downloading && c.downloading.id !== m.id)
  const fits = m.needs_vram_mb
  let body
  if (!m.available) body = html`<div class="faint">Not available yet</div>`
  else if (m.fit === 'no_gpu') body = html`<div class="warn">Needs an NVIDIA GPU or a Mac with Apple Silicon</div>`
  else if (m.fit === 'too_small') body = html`<div class="warn">Needs a GPU with at least ${gb(fits)} of memory; this one has ${gb(s.hardware.total_mb)}</div>`
  else if (down) body = html`<${Bar} frac=${m.job.total > 0 ? m.job.done / m.job.total : null} /><div class="detail">Downloading: ${gb(m.job.done / 1048576)} of ${gb(m.job.total / 1048576)}${mine ? '. It is used as soon as it is ready.' : ''}</div>`
  else if (mine && c.stage === 'load') body = html`<${Bar} frac=${null} /><div class="detail">Loading ${m.name}…</div>`
  else if (m.active) body = html`<div class="faint small">Making your pictures now. To delete its files, switch to another model first.</div>`
  else body = html`<div class="row">
      <${Pill} disabled=${otherDownload} onClick=${() => onChoose(m)}>${action}<//>
      ${otherDownload ? html`<span class="faint small">Wait for the other download</span>` : m.fit === 'busy' ? html`<span class="warn small">Something else is using the GPU memory: close it first</span>` : null}
      ${m.installed && (m.deletable || m.user) ? html`<button class="link" onClick=${() => onAskDelete(m)}>${m.user ? 'Remove' : 'Delete files'}</button>` : null}
    </div>`
  return html`<div class=${'card' + (hero ? ' hero' : '') + (m.active ? ' active' : '')}>
    <div class="cardhead"><span class=${'cardname' + (m.available ? '' : ' faint')}>${m.name}</span>${m.active ? html`<${Tag} dark>In use<//>` : recommended ? html`<${Tag}>Recommended for your GPU<//>` : null}</div>
    <div class="tagline">${m.tagline}</div>
    <div class="facts">${[m.size_mb > 0 ? gb(m.size_mb) + ' download' : null, 'needs about ' + gb(fits) + ' of GPU memory', m.needs_ram_mb > 0 ? 'and about ' + gb(m.needs_ram_mb) + ' of RAM' : null, m.speed || null].filter(Boolean).join('  ·  ')}</div>
    ${m.needs_ram_mb > 0 && s.ram_free_mb != null && s.ram_free_mb < m.needs_ram_mb ? html`<div class="warn small" style="margin-top:4px">Only ${gb(s.ram_free_mb)} of RAM is free now: close other programs before using it.</div>` : null}
    ${m.licence && html`<div class="licence">Licence: ${m.licence}${m.page ? html`  <a href=${m.page} target="_blank" rel="noopener noreferrer">(open model page)</a>` : null}</div>`}
    <div class="cardbody">${body}</div>
    ${m.user && !m.installed && !m.active && !down ? html`<button class="link" onClick=${() => c.delete(m.id)}>Remove from the list</button>` : null}
    ${m.job?.state === 'error' && !down ? html`<div class="err small">${m.job.message}</div>` : null}
  </div>`
}

/** The question before deleting a model's files. */
export const ConfirmDelete = ({ m, onYes, onNo }) => html`<${Confirm} title=${`Delete ${m.name}?`} body=${`Its downloaded files (${gb(m.size_mb)}) are removed from this computer. You can download it again later.`} yes="Delete" no="Keep it" onYes=${onYes} onNo=${onNo} />`
/** Deleting asks first when there are files to lose; a model that is only in the list goes at once. */
export const askDelete = (c, setToDelete) => m => (m.installed ? setToDelete(m) : c.delete(m.id))

/** Paste a Hugging Face link (or owner/name): the engine checks it is a Stable Diffusion model it can run and adds it to the list. */
const AddFromLink = ({ c }) => {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(/** @type {string|null} */ (null))
  const go = async () => { if (busy || !text.trim()) return; setBusy(true); setMsg(null); const m = await c.add(text.trim()); setBusy(false); setMsg(m); if (m.startsWith('Added')) setText('') }
  return html`<${Heading}>Add a model from Hugging Face<//>
    <div class="row"><input class="field" type="text" placeholder="https://huggingface.co/owner/model   or   owner/model" value=${text} onInput=${e => setText(e.target.value)} onKeyDown=${e => e.key === 'Enter' && go()} />
      <${Pill} disabled=${busy || !text.trim()} onClick=${go}>${busy ? 'Checking…' : 'Add'}<//></div>
    <div class="faint small">Stable Diffusion 1.x / 2.x models in diffusers format with safetensors weights (including turbo and LCM versions). Others are refused with the reason.</div>
    ${msg && html`<div class=${'small ' + (msg.startsWith('Added') ? 'muted' : 'err')}>${msg}</div>`}`
}

/** All the models, then the field to add one by link. Used in the settings. */
export const ModelList = ({ c, onChoose, onAskDelete }) => {
  const s = c.state
  return html`<div class="cards">${s.models.map(m => html`<${ModelCard} m=${m} c=${c} recommended=${m.id === s.recommended} action=${m.installed ? 'Use this model' : 'Download and use'} onChoose=${onChoose} onAskDelete=${onAskDelete} />`)}</div>
    <${AddFromLink} c=${c} />
    <div class="faint small" style="margin-top:18px">A model that was already in your Hugging Face cache is used as it is and is never deleted from here.</div>`
}

/**
 * The first thing a new person sees: what this computer can run, and one clear choice, the recommended model, with everything else one tap away. Choosing downloads it (if
 * need be) while the next screen asks what they like.
 */
export const FirstModel = ({ c, onChoose }) => {
  useCtl(c); const [others, setOthers] = useState(false), [toDelete, setToDelete] = useState(/** @type {any} */ (null))
  const s = c.state, rec = s?.models.find(m => m.id === s.recommended && m.available), rest = s ? s.models.filter(m => m !== rec) : []
  return html`<div class="screen"><div class="column">
    <${Brand} /><div class="step-no">STEP 1 OF 2</div><h1>Choose how images are made</h1>
    <p class="sub">Images are made on this computer, by a model that runs on its graphics card. It is downloaded once and kept. While it downloads you can pick what you like to see.</p>
    ${!s ? html`<div class="faint">Looking at this computer…</div><${Bar} frac=${null} />` : html`
      <${Hardware} s=${s} />
      ${c.error && html`<div class="err" style="margin-top:14px">${c.error}</div>`}
      ${rec && html`<div style="height:20px"></div><${ModelCard} m=${rec} c=${c} recommended hero action=${rec.installed ? `Use ${rec.name} and continue` : `Download ${rec.name} (${gb(rec.size_mb)}) and continue`} onChoose=${onChoose} onAskDelete=${askDelete(c, setToDelete)} />`}
      ${!rec || others ? html`<${Heading}>${rec ? 'Other models' : 'Models'}<//><div class="cards">${rest.map(m => html`<${ModelCard} m=${m} c=${c} recommended=${false} action=${m.installed ? 'Use and continue' : 'Download and continue'} onChoose=${onChoose} onAskDelete=${askDelete(c, setToDelete)} />`)}</div>`
        : html`<div style="margin-top:18px"><${Ghost} onClick=${() => setOthers(true)}>Other models (${rest.length})<//></div>`}`}
  </div>${toDelete && html`<${ConfirmDelete} m=${toDelete} onYes=${() => { c.delete(toDelete.id); setToDelete(null) }} onNo=${() => setToDelete(null)} />`}</div>`
}

/** On the screens that follow the choice: how the download is going, so the wait is never hidden. */
export const ModelStrip = ({ c }) => {
  useCtl(c); const m = c.targetCard
  let text, frac
  if (c.error) { text = c.error; frac = 0 }
  else if (!m) { text = c.notice ? `${c.notice}: ready.` : ''; frac = 1 }
  else if (c.stage === 'download') { text = `Downloading ${m.name}: ${gb((m.job?.done ?? 0) / 1048576)} of ${gb(Math.max(m.job?.total ?? 0, m.size_mb * 1048576) / 1048576)}`; frac = c.downloadFraction }
  else { text = `Loading ${m.name}…`; frac = null }
  if (!text) return null
  return html`<div class="strip"><div class=${c.error ? 'err' : ''}>${text}</div>${!c.error && frac !== 1 && html`<${Bar} frac=${frac} thin />`}</div>`
}

/** Over the mosaic: what a model change is doing right now, so the person can keep looking while it happens. */
export const StatusPill = ({ c }) => {
  useCtl(c); const m = c.targetCard
  let text = null
  if (c.error) text = `Could not switch: ${c.error}  (tap to dismiss)`
  else if (m && c.stage === 'download') text = `Downloading ${m.name}: ${gb((m.job?.done ?? 0) / 1048576)} of ${gb(Math.max(m.job?.total ?? 0, m.size_mb * 1048576) / 1048576)}`
  else if (m) text = `Switching to ${m.name}…`
  else if (c.notice) text = c.notice
  if (!text) return null
  return html`<div class=${'statuspill' + (c.error ? ' error' : '')} onClick=${() => c.error && c.dismissError()}>
    <b>${text}</b>${!c.error && m && html`<${Bar} frac=${c.stage === 'download' ? c.downloadFraction : null} thin />`}
    ${!c.error && m && c.stage === 'download' && html`<div class="faint small">The mosaic keeps its current pictures until it is ready.</div>`}</div>`
}
