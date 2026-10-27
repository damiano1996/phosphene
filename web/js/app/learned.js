// @ts-check
import { html, useState, Ghost, Heading, Confirm, cap } from './ui.js'
import { describe } from '../core/learned.js'
import { TasteGraph } from './graph.js'

const TYPE_WORDS = { pick: 'chose', view: 'looked at large', save: 'saved', dismiss: 'said not for me', dwell: 'stayed on' }
const ago = t => { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago` }
const Row = ({ label, value, sure }) => html`<div class="lrow"><span class="llabel">${label}</span><span class="ltrack"><span class="lmid"></span><span class=${'lfill ' + (value >= 0 ? 'pos' : 'neg')} style=${{ [value >= 0 ? 'left' : 'right']: '50%', width: Math.min(50, Math.abs(value) * 50) + '%', opacity: sure ?? 1 }}></span></span></div>`

/**
 * What the model has learned about the person, all of it in view: the signals it rests on, the taste by category and concept, what they like in the pictures themselves, and where
 * their launches start. Each signal can be forgotten, learning can be paused, everything can be forgotten or exported. It all stays on this computer.
 */
export const Learned = ({ user, world, atlas, store, vocab = [] }) => {
  const [, tick] = useState(0), [ask, setAsk] = useState(false), [paused, setPaused] = useState(user.paused), refresh = () => tick(n => n + 1)
  if (!world) return html`<p class="muted">Nothing to show yet.</p>`
  const model = world.model, d = describe(model, atlas, vocab, world.facets), signals = model.signals()
  const maxCat = Math.max(0.01, ...d.categories.map(c => Math.abs(c.score)))
  const days = d.oldest ? Math.max(1, Math.round((Date.now() - d.oldest) / 864e5)) : 0
  const hist = [...user.history.liked].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: 'Everything Phosphene has learned about you. It never leaves your computer.', signals: model.toJSON(), launches: user.history.toJSON(), favourites: user.favs, hidden: user.hidden }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'phosphene-what-it-learned.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  const forget = id => { model.remove(id); refresh() }
  return html`<h1>What it learned</h1>
    <p class="sub">Phosphene learns from what you do, to show you more of what you like. This is all of it, in one place. It stays on this computer: nothing is sent anywhere, and you can remove any of it.</p>
    <div class="learnbox">${d.n === 0 ? 'It has not learned anything yet. Choose, look at and save pictures and it will start to show here.'
      : html`Based on your last <b>${d.n}</b> signals${days ? html` (over ${days} day${days > 1 ? 's' : ''})` : ''}: ${Object.entries(d.counts).map(([t, n]) => `${n} ${t === 'pick' ? 'choices' : t === 'view' ? 'large views' : t === 'save' ? 'saves' : t === 'dismiss' ? 'not for me' : 'stays'}`).join(', ')}.
        ${!d.enough && html`<div class="faint small" style="margin-top:6px">That is still little: what follows is a first guess.</div>`}`}
      <div class="faint small" style="margin-top:8px">It follows your taste as it changes: it keeps your last ${model.window} signals, counts recent ones more, and a signal loses half its weight every ${Math.round(model.halfLifeMs / 864e5)} days.</div></div>
    <label class="switch" style="margin:16px 0"><input type="checkbox" checked=${paused} onChange=${e => { setPaused(e.target.checked); user.paused = e.target.checked; user.save(); world.learning = !e.target.checked }} /><span class="track"></span><span>Pause learning (your choices are not recorded while this is on)</span></label>
    ${d.n > 0 && html`
      <${Heading}>What you like in the pictures<//>
      ${d.traits.length ? d.traits.map(t => html`<div class="lrow"><span class="llabel">${cap(t.text)}</span><span class="ltrack"><span class="lmid"></span><span class="lfill pos" style=${{ left: '50%', width: Math.min(50, Math.abs(t.weight) * 40) + '%', opacity: 0.35 + 0.65 * t.sure }}></span></span></div>`)
        : html`<div class="faint small">Nothing clear yet: colour, light, detail and composition need more pictures to say anything.</div>`}
      ${world.facets && html`<${Heading}>The finer look you like<//>
        ${d.looks.length ? d.looks.map(t => html`<div class="lrow"><span class="llabel">${cap(t.label)} <span class="faint small">${t.group}</span></span><span class="ltrack"><span class="lmid"></span><span class=${'lfill ' + (t.weight >= 0 ? 'pos' : 'neg')} style=${{ [t.weight >= 0 ? 'left' : 'right']: '50%', width: Math.min(50, Math.abs(t.weight) * 30 * (0.4 + 0.6 * t.sure)) + '%' }}></span></span></div>`)
          : html`<div class="faint small">Nothing clear yet: it learns which kinds of a thing you like (pale rock or green meadows, golden hour or fog) as you look at more pictures.</div>`}`}
      ${vocab.length > 0 && html`<${Heading}>In words<//>
        ${d.words.length ? d.words.map(w => html`<div class="lrow"><span class="llabel">${cap(w.label)} <span class="faint small">${w.group}</span></span><span class="ltrack"><span class="lmid"></span><span class=${'lfill ' + (w.weight >= 0 ? 'pos' : 'neg')} style=${{ [w.weight >= 0 ? 'left' : 'right']: '50%', width: Math.min(50, Math.abs(w.weight) * 40) + '%', opacity: 0.35 + 0.65 * w.sure }}></span></span></div>`)
          : html`<div class="faint small">The reader of pictures is on, but it has not seen enough of your choices to name words yet.</div>`}
        ${store?.recentCaptions?.length > 0 && html`<div class="faint small" style="margin:10px 0 4px">What it just read</div>${store.recentCaptions.slice(0, 4).map(x => html`<div class="muted small" style="padding:2px 0">“${x.text}”</div>`)}`}`}
      <div class="faint small" style="margin:8px 0">Style that is drawn: ${d.styles.map(s => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}. It leans towards what you favour, never fully.</div>
      <${Heading}>Your taste, as a map<//>
      <p class="muted small">Every dot is a concept, grouped by category. Blue ones you like more than average; red ones less. Hollow dots are things you have hardly looked at, so it does not know yet.</p>
      <${TasteGraph} model=${model} atlas=${atlas} world=${world} facets=${world.facets} />
      <${Heading}>Your taste by category<//>
      ${d.categories.map(c => html`<${Row} label=${html`${cap(c.name)}${user.hidden.includes(c.name) ? html` <span class="faint">(hidden)</span>` : ''}`} value=${c.score / maxCat} />`)}
      <${Heading}>Concepts it likes most, and least<//>
      <div class="chips">${d.top.map(c => html`<span class="chip on static">${cap(c.name)}</span>`)}</div>
      <div class="chips" style="margin-top:8px">${d.bottom.map(c => html`<span class="chip static">${cap(c.name)}</span>`)}</div>`}
    ${hist.length > 0 && html`<${Heading}>Where your launches start<//>
      <p class="muted small">Kept between launches, separately from the above: what you lingered on in earlier sessions, fading a little each time. It decides the first screen.</p>
      <div class="chips">${hist.map(([c]) => html`<span class="chip static">${cap(atlas.names[c] ?? '?')}</span>`)}</div>`}
    ${signals.length > 0 && html`<${Heading}>Recent signals<//>
      <div class="signals">${signals.slice(0, 25).map(s => html`<div class="signal"><span class="faint small">${ago(s.t)}</span><span>${TYPE_WORDS[s.type] ?? s.type} <b>${s.z ? cap(atlas.names[atlas.nearestConcept(s.z)]) : '…'}</b></span><span class="faint small">weight ${s.weight.toFixed(1)}</span><button class="link" onClick=${() => forget(s.id)}>Forget this</button></div>`)}</div>`}
    <${Heading}>Your data<//>
    <div class="row"><${Ghost} onClick=${exportData}>Export what it learned (JSON)<//><${Ghost} onClick=${() => setAsk(true)}>Forget everything it learned<//></div>
    ${ask && html`<${Confirm} title="Forget everything it learned?" body="Your signals and where your launches start are removed. Saved pictures and your choices stay. The next pictures start without it." yes="Forget" no="Keep it" onYes=${() => { setAsk(false); user.forgetLearning(); refresh() }} onNo=${() => setAsk(false)} />`}`
}
