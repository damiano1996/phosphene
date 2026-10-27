// @ts-check
import { html, useState, useCtl, gb, phase, CategoryPicker, Splash, Brand } from './ui.js'
import { ModelStrip } from './models-ui.js'

/** The second first-run screen: pick what inspires you (any number, or none). The strip underneath shows how the model download is going. */
export const Categories = ({ c, atlas, onDone }) => {
  const [chosen, setChosen] = useState(/** @type {Set<string>} */ (new Set()))
  const toggle = cat => setChosen(s => { const n = new Set(s); if (!n.delete(cat)) n.add(cat); return n })
  const n = chosen.size, label = n === 0 ? 'Start without choosing' : n < 3 ? `Start with ${n} (a few more helps)` : `Start with ${n}`
  return html`<div class="screen fixedfoot"><div class="scroll"><div class="column">
      <${Brand} /><div class="step-no">STEP 2 OF 2</div><h1>What inspires you?</h1>
      <p class="sub">Pick a few things you like to look at: the more you pick, the better your first screen. Or pick none and it will learn from what you stay on.</p>
      <${CategoryPicker} categories=${atlas.categoryNames} selected=${chosen} toggle=${toggle} />
      <p class="faint small" style="margin-top:30px">Everything stays on this computer: what you pick, what you look at and what you save. Nothing is sent anywhere. You can change these later in the settings.</p>
    </div></div>
    <div class="foot"><${ModelStrip} c=${c} /><button class="bigpill" onClick=${() => onDone([...chosen])}>${label}</button></div></div>`
}

/** The steps between the choice of a model and the mosaic, as the waiting screen shows them. */
export const Prepare = ({ c }) => {
  useCtl(c); const m = c.targetCard, stage = c.stage, name = m?.name ?? 'the model'
  const down = stage === 'download' || (!m && !c.state) ? 'active' : 'done'
  const load = stage === 'load' ? 'active' : stage === 'ready' ? 'done' : 'todo'
  const total = Math.max(m?.job?.total ?? 0, (m?.size_mb ?? 0) * 1048576)
  return html`<${Splash} title="Preparing your first images" subtitle="This happens once for a new model." steps=${[
    { label: `Download ${name}`, state: down, progress: c.downloadFraction, detail: m ? `${gb((m.job?.done ?? 0) / 1048576)} of ${gb(total / 1048576)}` : '' },
    { label: 'Load it onto the graphics card', state: load, progress: null, detail: c.loading ? phase(c.state.activation.message) : '' },
    { label: 'Draw the first pictures', state: stage === 'ready' ? 'active' : 'todo' },
  ]} />`
}
