import test from 'node:test'
import assert from 'node:assert/strict'
import { atlas } from './helpers.js'
import { PreferenceModel } from '../js/core/preference.js'
import { layout, tasteMap, aggregate } from '../js/core/tree.js'
import { sections } from '../js/app/ui.js'

const groups = sections(atlas.categoryNames)

test('every concept is a leaf exactly once, on the outer ring, and no two leaves overlap', () => {
  const t = layout(atlas, groups)
  assert.equal(t.leaves.length, atlas.size)
  assert.equal(new Set(t.leaves.map(l => l.concept)).size, atlas.size)
  for (const l of t.leaves) assert.ok(Math.abs(Math.hypot(l.x, l.y) - t.rings[2]) < 1e-6)
  const angles = t.leaves.map(l => l.angle)
  for (let i = 1; i < angles.length; i++) assert.ok(angles[i] - angles[i - 1] > 0.005, 'leaves are spaced')
  assert.ok(angles[angles.length - 1] - angles[0] < 2 * Math.PI)
})
test('categories and groups sit between their children, and every edge joins two known nodes', () => {
  const t = layout(atlas, groups), byId = new Map(t.nodes.map(n => [n.id, n]))
  for (const [a, b] of t.edges) assert.ok(byId.has(a) && byId.has(b))
  assert.equal(t.nodes.filter(n => n.kind === 'category').length, atlas.categoryNames.length)
  for (const n of t.nodes.filter(n => n.kind === 'category')) {
    const kids = t.leaves.filter(l => l.parent === n.id), lo = Math.min(...kids.map(k => k.angle)), hi = Math.max(...kids.map(k => k.angle))
    assert.ok(n.angle >= lo - 1e-9 && n.angle <= hi + 1e-9)
  }
})
test('a model that has seen nothing shows nothing seen; one that loved a concept shows it, and its neighbours more than far concepts', () => {
  const model = new PreferenceModel(5, atlas.dim), empty = tasteMap(model, atlas)
  assert.ok(Math.max(...empty.seen) < 1e-9)
  const c = atlas.names.indexOf('a waterfall'); assert.ok(c >= 0)
  for (let i = 0; i < 6; i++) model.observeChoice([atlas.coords[c], ...Array.from({ length: 5 }, (_, j) => atlas.coords[(j * 97 + 11 + i) % atlas.size])], 0, 1.5, false, { type: 'save' })
  const m = tasteMap(model, atlas)
  assert.ok(m.seen[c] > 0.6, 'the loved concept is well known')
  const far = [...atlas.coords.keys()].sort((a, b) => dist(atlas.coords[b], atlas.coords[c]) - dist(atlas.coords[a], atlas.coords[c]))[0]
  assert.ok(m.seen[far] < m.seen[c] * 0.2, 'a far concept is not')
  assert.ok(m.score[c] > 0, 'and it is liked')
  const cat = aggregate(m.score, m.seen, atlas.conceptsIn(atlas.categoryOf(c))); assert.ok(cat.score > 0)
})
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
