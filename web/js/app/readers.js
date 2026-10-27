// @ts-check
import { html, useState, gb, Pill, Ghost, Tag, Heading, Bar, Chip, Confirm } from './ui.js'

const DEVICES = [['auto', 'Automatic'], ['gpu', 'Graphics card'], ['cpu', 'Processor']]

/**
 * Optional: a small model that reads every finished picture and says what it looks like (style, light, colour, composition, mood, and for some a sentence), so that the recommender
 * can learn what you like about the pictures in words. Each one says whether this computer has room for it, on the graphics card beside the image model or on the processor.
 */
export const Readers = ({ c, user, store }) => {
  const s = c.state, [device, setDevice] = useState(user.readerDevice ?? 'auto'), [scope, setScope] = useState(user.readerScope), [toDelete, setToDelete] = useState(/** @type {any} */ (null))
  if (!s || !s.captioners) return null
  const r = c.reader
  const card = m => {
    const down = m.job?.state === 'downloading', mine = r?.id === m.id, loading = mine && r.phase === 'loading', failed = mine && r.phase === 'error'
    const where = m.can_gpu ? (m.can_cpu ? 'graphics card or processor' : 'graphics card only') : m.can_cpu ? 'processor' : null
    return html`<div class=${'card' + (m.active ? ' active' : '')}>
      <div class="cardhead"><span class="cardname">${m.name}</span>${m.active ? html`<${Tag} dark>On, ${r.device === 'cpu' ? 'processor' : 'graphics card'}<//>` : null}</div>
      <div class="tagline">${m.tagline}</div>
      <div class="facts">${gb(m.size_mb)} download  ·  needs about ${gb(m.needs_vram_mb)} on the graphics card or ${gb(m.needs_ram_mb)} on the processor  ·  ${m.speed}</div>
      <div class=${'small ' + (where ? 'faint' : 'warn')} style="margin-top:4px">${where ? `Room for it here: ${where}.` : 'This computer has no room for it right now.'}</div>
      <div class="cardbody">${down ? html`<${Bar} frac=${m.job.total > 0 ? m.job.done / m.job.total : null} /><div class="detail">Downloading: ${gb(m.job.done / 1048576)} of ${gb(m.job.total / 1048576)}</div>`
        : loading ? html`<${Bar} frac=${null} /><div class="detail">Loading…</div>`
        : m.active ? html`<div class="row"><${Ghost} onClick=${() => c.readerOff()}>Turn off<//></div>`
        : !m.installed ? html`<div class="row"><${Pill} disabled=${!where} onClick=${() => c.installReader(m.id)}>Download (${gb(m.size_mb)})<//></div>`
        : html`<div class="row"><${Pill} disabled=${!where} onClick=${() => c.readerOn(m.id, device)}>Turn on<//>${m.deletable ? html`<button class="link" onClick=${() => setToDelete(m)}>Delete files</button>` : null}</div>`}
        ${failed ? html`<div class="err small" style="margin-top:8px">${r.message}</div>` : null}
        ${m.job?.state === 'error' && !down ? html`<div class="err small">${m.job.message}</div>` : null}</div></div>`
  }
  return html`<${Heading}>Understand the pictures (optional)<//>
    <p class="muted small" style="margin-top:0">A small model can read each picture and say what it looks like in words: the style, the light, the colours, how it is composed. The recommender then learns which of those you like, and "What it learned" shows it in words. It runs on this computer; nothing is sent anywhere.</p>
    <div class="faint small" style="margin:10px 0 6px">Where it runs</div>
    <div class="chips">${DEVICES.map(([id, label]) => html`<${Chip} on=${device === id} onClick=${() => { setDevice(id); user.readerDevice = id; user.save() }}>${label}<//>`)}</div>
    <div class="faint small" style="margin:14px 0 6px">What it reads</div>
    <div class="chips"><${Chip} on=${scope == null} onClick=${() => { setScope(null); user.readerScope = null; user.save() }}>What suits the model<//><${Chip} on=${scope === 'all'} onClick=${() => { setScope('all'); user.readerScope = 'all'; user.save() }}>Every picture<//><${Chip} on=${scope === 'centre'} onClick=${() => { setScope('centre'); user.readerScope = 'centre'; user.save() }}>Only the centre picture<//></div>
    <div class="cards" style="margin-top:14px">${s.captioners.map(card)}</div>
    ${toDelete && html`<${Confirm} title=${`Delete ${toDelete.name}?`} body=${`Its downloaded files (${gb(toDelete.size_mb)}) are removed from this computer. You can download it again later.`} yes="Delete" no="Keep it" onYes=${() => { c.delete(toDelete.id); setToDelete(null) }} onNo=${() => setToDelete(null)} />`}`
}
