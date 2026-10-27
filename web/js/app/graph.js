// @ts-check
import { html, useState, useMemo, useRef, cap, sections } from './ui.js'
import { layout, tasteMap, aggregate } from '../core/tree.js'

// Diverging (blue = likes more than average, red = likes less) around a neutral grey; a concept the model has barely seen is hollow, not red: not knowing is not disliking.
const LIKE = [42, 120, 214], DISLIKE = [227, 73, 72], NEUTRAL = [228, 226, 233]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`
const SEEN_MIN = 0.12, SHOW_MIN = 0.12, R = 560, KIDS_RING = 372, EXPAND_SEEN = 0.3, MAX_OPEN = 14, MAX_SCALE = 8

/** The colour of a score (-1..1) at a confidence (0..1). */
const tone = (s, seen) => { const t = Math.min(1, Math.abs(s)); return rgb(mix(NEUTRAL, s >= 0 ? LIKE : DISLIKE, seen < SEEN_MIN ? 0 : 0.25 + 0.75 * t)) }

/**
 * The tree of concepts, with what the model has learned painted on it: the person at the centre, then groups of categories, categories and, at the rim, every concept. Blue is more
 * liked than average, red less; a hollow dot is something it has hardly seen. A concept the model knows you like opens into its finer kinds (the Dolomites, the green meadows...) on an
 * outer ring, each painted by what the model learned about how such pictures look. The eight best liked concepts are numbered and listed underneath. Scroll or pinch to zoom, drag to
 * move, double-click to reset; hover (or tap) any dot for its name.
 * @param {{model: import('../core/preference.js').PreferenceModel, atlas: import('../core/atlas.js').Atlas, world?: any, facets?: import('../core/facets.js').Facets|null}} p
 */
export const TasteGraph = ({ model, atlas, world, facets }) => {
  const [hover, setHover] = useState(/** @type {any} */ (null)), [view, setView] = useState({ s: 1, x: 0, y: 0 }), drag = useRef(/** @type {any} */ (null)), pts = useRef(new Map())
  const g = useMemo(() => layout(atlas, sections(atlas.categoryNames)), [atlas])
  const sig = model.signals().length, tm = useMemo(() => tasteMap(model, atlas), [model, atlas, sig])
  const { score, seen, maxAbs } = tm, norm = c => score[c] / maxAbs
  const conceptsOf = new Map(); for (const l of g.leaves) { const k = /** @type {string} */ (l.parent); (conceptsOf.get(k) ?? conceptsOf.set(k, []).get(k)).push(/** @type {number} */ (l.concept)) }
  const catAgg = new Map(); for (const [k, cs] of conceptsOf) catAgg.set(k, aggregate(score, seen, cs))
  const groupAgg = new Map(); for (const n of g.nodes) if (n.kind === 'category') { const p = n.parent; (groupAgg.get(p) ?? groupAgg.set(p, []).get(p)).push(...(conceptsOf.get(n.id) ?? [])) }
  const rankOf = l => score[/** @type {number} */ (l.concept)] * Math.sqrt(seen[/** @type {number} */ (l.concept)])          // the best liked, counting how well each is known
  const top = g.leaves.filter(l => seen[/** @type {number} */ (l.concept)] >= SEEN_MIN && score[/** @type {number} */ (l.concept)] > 0).sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 8)
  const rank = new Map(top.map((l, i) => [l.id, i + 1]))
  const byId = new Map(g.nodes.map(n => [n.id, n]))
  // the finer kinds of the concepts it knows you like: one dot each on an outer ring, painted by how much the model likes the attributes that kind carries
  const kids = useMemo(() => {
    const out = []; if (!facets || !world || model.attrs !== facets.A) return out
    const n = facets.variants
    const open = g.leaves.filter(l => seen[/** @type {number} */ (l.concept)] >= EXPAND_SEEN && norm(/** @type {number} */ (l.concept)) >= 0.2).sort((a, b) => rankOf(b) - rankOf(a)).slice(0, MAX_OPEN)          // only the ones it is surest you like open up
    for (const l of open) {
      const c = /** @type {number} */ (l.concept)
      const name = atlas.names[c], us = []
      for (let v = 1; v < n; v++) { const k = facets.kind(name, v); if (!k) continue; us.push({ v, phrase: k.phrase, u: model.appearanceUtility(world.attrsAppearance(name, v, 0)) }) }
      if (!us.length) continue
      const mean = us.reduce((s, x) => s + x.u, 0) / us.length, span = 0.011
      us.forEach((x, i) => { const a = l.angle + (i - (us.length - 1) / 2) * span; out.push({ id: `${l.id}:${x.v}`, parent: l, concept: c, phrase: x.phrase, rel: x.u - mean, angle: a, x: KIDS_RING * Math.cos(a), y: KIDS_RING * Math.sin(a) }) })
    }
    const mx = Math.max(1e-6, ...out.map(k => Math.abs(k.rel))); for (const k of out) k.rel /= mx
    return out
  }, [model, atlas, facets, world, sig])
  const vb = { w: (2 * R) / view.s }, box = `${view.x - vb.w / 2} ${view.y - vb.w / 2} ${vb.w} ${vb.w}`
  const toSvg = (/** @type {PointerEvent|WheelEvent} */ e, /** @type {SVGSVGElement} */ svg) => { const r = svg.getBoundingClientRect(); return [view.x - vb.w / 2 + ((e.clientX - r.left) / r.width) * vb.w, view.y - vb.w / 2 + ((e.clientY - r.top) / r.height) * vb.w, r] }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const setZoom = (s, ax = view.x, ay = view.y) => {            // zoom to s keeping the point (ax, ay) where it is on screen
    s = clamp(s, 1, MAX_SCALE); const k = view.s / s, nx = ax + (view.x - ax) * k, ny = ay + (view.y - ay) * k, lim = R * (1 - 1 / s)
    setView({ s, x: s === 1 ? 0 : clamp(nx, -lim, lim), y: s === 1 ? 0 : clamp(ny, -lim, lim) })
  }
  const wheelRef = useRef(/** @type {any} */ (null))
  const onWheel = (/** @type {WheelEvent} */ e) => { e.preventDefault(); const [ax, ay] = toSvg(e, /** @type {SVGSVGElement} */ (e.currentTarget)); setZoom(view.s * Math.exp(-e.deltaY * 0.0015), ax, ay) }
  wheelRef.current = onWheel
  const near = (/** @type {PointerEvent} */ e) => {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget), [x, y, r] = toSvg(e, svg), thr = 18 / view.s
    let best = null, bd = thr * thr; for (const l of g.leaves) { const d = (l.x - x) ** 2 + (l.y - y) ** 2; if (d < bd) { bd = d; best = { kind: 'concept', n: l } } }
    for (const k of kids) { const d = (k.x - x) ** 2 + (k.y - y) ** 2; if (d < bd) { bd = d; best = { kind: 'kid', n: k } } }
    setHover(best && { ...best, px: e.clientX - r.left, py: e.clientY - r.top, w: r.width })
  }
  const down = (/** @type {PointerEvent} */ e) => { const svg = /** @type {SVGSVGElement} */ (e.currentTarget); svg.setPointerCapture?.(e.pointerId); pts.current.set(e.pointerId, [e.clientX, e.clientY]); drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, d0: 0, s0: view.s }; if (pts.current.size === 1) near(e) }
  const move = (/** @type {PointerEvent} */ e) => {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget), r = svg.getBoundingClientRect(), d = drag.current
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, [e.clientX, e.clientY])
    if (pts.current.size === 2) {                              // pinch
      const [a, b] = [...pts.current.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]); if (!d.d0) { d.d0 = dist; d.s0 = view.s } else setZoom(d.s0 * dist / d.d0); d.moved = true; return
    }
    if (d && e.buttons && view.s > 1) {                       // drag to move
      const dx = ((e.clientX - d.x) / r.width) * vb.w, dy = ((e.clientY - d.y) / r.height) * vb.w, lim = R * (1 - 1 / view.s)
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true
      setView({ s: view.s, x: clamp(d.vx - dx, -lim, lim), y: clamp(d.vy - dy, -lim, lim) }); setHover(null); return
    }
    near(e)
  }
  const up = (/** @type {PointerEvent} */ e) => { pts.current.delete(e.pointerId); if (pts.current.size < 2 && drag.current) drag.current.d0 = 0 }
  const flip = a => Math.cos(a) < 0
  const hc = hover?.kind === 'concept' ? hover.n.concept : hover?.kind === 'kid' ? hover.n.concept : null, hs = hc != null ? seen[hc] : 0
  const zoomed = view.s >= 3, inView = (/** @type {{x: number, y: number}} */ p) => Math.abs(p.x - view.x) < vb.w / 2 + 20 && Math.abs(p.y - view.y) < vb.w / 2 + 20
  const named = zoomed ? g.leaves.filter(l => inView(l)).slice(0, 140) : []
  return html`<div class="tgraph">
    <div class="tg-zoom"><button aria-label="Zoom in" onClick=${() => setZoom(view.s * 1.6)}>+</button><button aria-label="Zoom out" onClick=${() => setZoom(view.s / 1.6)}>−</button><button aria-label="Reset the view" onClick=${() => setView({ s: 1, x: 0, y: 0 })}>⟲</button></div>
    <svg viewBox=${box} role="img" aria-label="Map of the concepts you like, by group, category and concept; scroll to zoom" ref=${el => { if (el && !el._w) { el._w = 1; el.addEventListener('wheel', ev => wheelRef.current(ev), { passive: false }) } }}
      onPointerMove=${move} onPointerLeave=${() => setHover(null)} onPointerDown=${down} onPointerUp=${up} onPointerCancel=${up} onDblClick=${() => setView({ s: 1, x: 0, y: 0 })}>
      <g class="tg-rings">${g.rings.map(r => html`<circle r=${r} />`)}${kids.length > 0 && html`<circle r=${KIDS_RING} class="tg-ring-kids" />`}</g>
      <g class="tg-edges">${g.edges.map(([a, b]) => { const p = byId.get(a), c = byId.get(b); return html`<line x1=${p.x} y1=${p.y} x2=${c.x} y2=${c.y} />` })}${kids.map(k => html`<line class="tg-kidedge" x1=${k.parent.x} y1=${k.parent.y} x2=${k.x} y2=${k.y} />`)}</g>
      ${g.nodes.filter(n => n.kind === 'group' && n.id !== 'root').map(n => { const a = aggregate(score, seen, groupAgg.get(n.id) ?? []); return html`<circle class="tg-node" cx=${n.x} cy=${n.y} r=${9} fill=${tone(a.score / maxAbs, a.seen)} />` })}
      ${g.nodes.filter(n => n.kind === 'category').map(n => { const a = catAgg.get(n.id); return html`<circle class="tg-node" cx=${n.x} cy=${n.y} r=${4.5} fill=${tone(a.score / maxAbs, a.seen)} />` })}
      ${g.leaves.map(l => { const c = /** @type {number} */ (l.concept), s = norm(c), known = seen[c] >= SEEN_MIN, on = known && Math.abs(s) >= SHOW_MIN
        return html`<circle class=${'tg-leaf' + (known ? '' : ' hollow') + (hover?.kind === 'concept' && hover.n.id === l.id ? ' hot' : '')} cx=${l.x} cy=${l.y} r=${known ? 2.6 + 2.6 * Math.min(1, Math.abs(s)) * seen[c] : 2} fill=${on ? tone(s, seen[c]) : known ? rgb(NEUTRAL) : '#fff'} />` })}
      ${kids.map(k => html`<circle class=${'tg-kid' + (hover?.kind === 'kid' && hover.n.id === k.id ? ' hot' : '')} cx=${k.x} cy=${k.y} r=${3.4} fill=${tone(k.rel, 1)} />`)}
      ${top.map(l => html`<g><circle class="tg-top" cx=${l.x} cy=${l.y} r=${8.5} fill=${rgb(LIKE)} /><text class="tg-num" x=${l.x} y=${l.y} text-anchor="middle" dominant-baseline="central">${rank.get(l.id)}</text></g>`)}
      ${g.nodes.filter(n => n.kind === 'category').map(n => html`<text class="tg-cat" transform=${`rotate(${(n.angle * 180) / Math.PI}) translate(${g.rings[2] + (kids.length ? 62 : 14)},0) ${flip(n.angle) ? 'rotate(180)' : ''}`} text-anchor=${flip(n.angle) ? 'end' : 'start'} dominant-baseline="central">${cap(n.label)}</text>`)}
      ${named.map(l => html`<text class="tg-name" transform=${`rotate(${(l.angle * 180) / Math.PI}) translate(${g.rings[2] - 6},0) ${flip(l.angle) ? 'rotate(180)' : ''}`} text-anchor=${flip(l.angle) ? 'start' : 'end'} dominant-baseline="central">${atlas.names[/** @type {number} */ (l.concept)]}</text>`)}
      ${g.nodes.filter(n => n.kind === 'group' && n.id !== 'root').map(n => html`<text class="tg-group" x=${n.x} y=${n.y - 15} text-anchor="middle">${n.label}</text>`)}
      <circle class="tg-root" r=${26} /><text class="tg-you" text-anchor="middle" dominant-baseline="central">You</text>
    </svg>
    ${hover && html`<div class="tg-tip" style=${{ left: Math.min(hover.px + 14, hover.w - 190) + 'px', top: hover.py + 14 + 'px' }}>
      ${hover.kind === 'kid'
        ? html`<b>${cap(hover.n.phrase)}</b><span class="faint small">A kind of ${atlas.names[hover.n.concept]}</span><div class="tg-val">${hover.n.rel > 0.15 ? 'You seem to like this look more' : hover.n.rel < -0.15 ? 'You seem to like this look less' : 'No clear leaning yet'}</div>`
        : html`<b>${cap(hover.n.label)}</b><span class="faint small">${cap(hover.n.category)}</span>
          <div class="tg-val">${hs < SEEN_MIN ? 'Not seen enough to say' : norm(hc) >= SHOW_MIN ? 'More than average' : norm(hc) <= -SHOW_MIN ? 'Less than average' : 'About average'}</div>
          <span class="faint small">${hs < SEEN_MIN ? 'Nothing you did has been near it.' : `Based on what you did near it (${Math.round(hs * 100)}% sure).`}</span>`}</div>`}
    <div class="tg-legend"><span><i style=${{ background: rgb(LIKE) }}></i>Likes more than average</span><span><i style=${{ background: rgb(DISLIKE) }}></i>Likes less</span><span><i class="hollow"></i>Not seen enough yet</span>${kids.length > 0 && html`<span><i class="kid"></i>Finer kinds it knows you like (outer ring)</span>`}</div>
    ${top.length > 0 && html`<ol class="tg-top-list">${top.map(l => html`<li><b>${cap(l.label)}</b> <span class="faint small">${cap(/** @type {string} */ (l.category))}</span></li>`)}</ol>`}
  </div>`
}
