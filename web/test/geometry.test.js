import test from 'node:test'
import assert from 'node:assert/strict'
import { Voronoi } from '../js/core/voronoi.js'
import { Lens } from '../js/core/lens.js'
import { inset, area as parea } from '../js/core/poly.js'
import * as Framing from '../js/core/framing.js'
import { SpiralWorld, Vogel } from '../js/core/spiral.js'
import { T } from '../js/core/tuning.js'
import { atlas, area, Rng } from './helpers.js'

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tolerance ${tol})`)

test('cells partition the box and each contains its site', () => {
  const rng = new Rng(4), n = 250
  const xs = Float64Array.from({ length: n }, () => rng.float() * 1000), ys = Float64Array.from({ length: n }, () => rng.float() * 700)
  const cells = new Voronoi().cells(xs, ys, n, 0, 0, 1000, 700)
  near(cells.reduce((s, c) => s + area(c), 0), 1000 * 700, 1000 * 700 * 0.002)
  for (let i = 0; i < n; i++) {
    const p = cells[i], m = p.length / 2
    for (let v = 0; v < m; v++) { const j = (v + 1) % m; const cr = (p[2 * j] - p[2 * v]) * (ys[i] - p[2 * v + 1]) - (p[2 * j + 1] - p[2 * v + 1]) * (xs[i] - p[2 * v]); assert.ok(cr >= -0.01, `site ${i} outside its cell`) }
  }
})

test('matches brute force on a clustered layout', () => {
  const rng = new Rng(9), n = 200
  const xs = Float64Array.from({ length: n }, () => rng.gauss() * 140 + 500), ys = Float64Array.from({ length: n }, () => rng.gauss() * 100 + 350)
  const fast = new Voronoi().cells(xs, ys, n, -2000, -2000, 3000, 3000), slow = new Voronoi(n - 1).cells(xs, ys, n, -2000, -2000, 3000, 3000)
  for (let i = 0; i < n; i++) {
    const a = area(slow[i]), b = area(fast[i])
    if (a < 60000) near(b, a, a * 0.002 + 0.5, `cell ${i}`); else assert.ok(b >= a * 0.999, `unbounded cell ${i} got smaller`)
  }
})

test('sites with negative coordinates are handled', () => {
  const rng = new Rng(21), n = 220
  const xs = Float64Array.from({ length: n }, () => rng.gauss() * 220 + 100), ys = Float64Array.from({ length: n }, () => rng.gauss() * 220 - 50)
  const box = 3000 * 3000, fast = new Voronoi().cells(xs, ys, n, -1500, -1500, 1500, 1500), slow = new Voronoi(n - 1).cells(xs, ys, n, -1500, -1500, 1500, 1500)
  near(fast.reduce((s, c) => s + area(c), 0), box, box * 0.002, 'cells overlap')
  for (let i = 0; i < n; i++) near(area(fast[i]), area(slow[i]), area(slow[i]) * 0.002 + 1, `cell ${i}`)
})

test('sites outside the box tile it exactly', () => {
  const rng = new Rng(3), n = 400
  const xs = Float64Array.from({ length: n }, () => rng.float() * 1200 - 60), ys = Float64Array.from({ length: n }, () => rng.float() * 2600 - 100)
  const top = 300, cells = new Voronoi().cells(xs, ys, n, 0, top, 1080, 2400), box = 1080 * (2400 - top)
  near(cells.reduce((s, c) => s + (c ? area(c) : 0), 0), box, box * 0.001, 'cells inside the box overlap or leave gaps')
})

test('spacing is even near and far from the origin', () => {
  for (const k0 of [300, 5000, 60000, 400000]) {
    let best = Infinity
    for (let k = Math.max(k0 - 4000, 0); k <= k0 + 4000; k++) if (k !== k0) best = Math.min(best, Math.hypot(Vogel.x(k) - Vogel.x(k0), Vogel.y(k) - Vogel.y(k0)))
    assert.ok(best >= 0.8 * T.SPACING && best <= 1.2 * T.SPACING, `k=${k0} nearest=${best}`)
  }
})

test('the lens-projected scene tiles the screen without overlap', () => {
  const w = 1080, h = 2400, m = 220, lens = new Lens(0.55 * Math.hypot(w, h)), world = new SpiralWorld(5, atlas)
  const rView = lens.limit / T.LENS_A * 2.62
  for (let step = 0; step <= 40; step += 5) {
    const camX = -step * 0.35 * T.SPACING; world.ensure(camX, 0, rView * 1.25)
    const out = [0, 0, 0], xs = [], ys = [], ks = []
    for (const c of world.nearby(camX, 0, rView)) { lens.project(c.x - camX, c.y, out); const sx = w / 2 + out[0], sy = h / 2 + out[1]; if (sx < -m || sx > w + m || sy < -m || sy > h + m) continue; xs.push(sx); ys.push(sy); ks.push(c.k) }
    const n = xs.length, rx = new Float64Array(n), ry = new Float64Array(n), idx = new Map(ks.map((k, i) => [k, i]))
    const frames = []; if (idx.has(0)) frames.push(new Framing.Frame(idx.get(0), 1, Framing.chooseOwners(world, 0).map(k => idx.get(k) ?? -1), 1))
    Framing.displace(xs, ys, n, frames, rx, ry, frames.map(() => new Framing.Size()))
    const cells = new Voronoi().cells(rx, ry, n, -m, -m, w + m, h + m), box = (w + 2 * m) * (h + 2 * m)
    near(cells.reduce((s, c) => s + (c ? area(c) : 0), 0), box, box * 0.001, `step ${step}: cells overlap or leave gaps`)
  }
})

test('inset shrinks a square by the right amount', () => {
  const q = inset([0, 0, 100, 0, 100, 100, 0, 100], 10, 50, 50)
  near(parea(q), 80 * 80, 1)
})

test('inset keeps every Voronoi cell inside itself', () => {
  const rng = new Rng(6), n = 120
  const xs = Float64Array.from({ length: n }, () => rng.float() * 800), ys = Float64Array.from({ length: n }, () => rng.float() * 600)
  const cells = new Voronoi().cells(xs, ys, n, 0, 0, 800, 600)
  for (let i = 0; i < n; i++) {
    const p = cells[i], q = inset(p, 6, xs[i], ys[i]); if (!q) continue
    assert.ok(parea(q) <= parea(p) + 0.5, `inset of cell ${i} is larger`)
    const m = q.length / 2; let sa = 0; for (let v = 0; v < m; v++) { const j = (v + 1) % m; sa += q[2 * v] * q[2 * j + 1] - q[2 * j] * q[2 * v + 1] }
    const sign = sa >= 0 ? 1 : -1
    for (let v = 0; v < m; v++) { const j = (v + 1) % m; const cr = (q[2 * j] - q[2 * v]) * (ys[i] - q[2 * v + 1]) - (q[2 * j + 1] - q[2 * v + 1]) * (xs[i] - q[2 * v]); assert.ok(cr * sign >= -0.05, `site left the inset cell ${i}`) }
  }
})

test('an inset never leaves its cell, even for slivers cut by the edge of the box (a speck above the top bar)', () => {
  const inside = (p, q) => { const m = p.length / 2; let s = 0; for (let i = 0; i < m; i++) { const j = (i + 1) % m, k = (j + 1) % m; s += ((p[2 * j] - p[2 * i]) * (p[2 * k + 1] - p[2 * j + 1]) - (p[2 * j + 1] - p[2 * i + 1]) * (p[2 * k] - p[2 * j])) > 0 ? 1 : -1 } const sg = s >= 0 ? 1 : -1
    for (let v = 0; v < q.length / 2; v++) for (let i = 0; i < m; i++) { const j = (i + 1) % m, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey) || 1; if (sg * (ex * (q[2 * v + 1] - p[2 * i + 1]) - ey * (q[2 * v] - p[2 * i])) / l < -0.05) return false } return true }
  let checked = 0
  for (const seed of [11, 12, 13, 14]) {
    const rng = new Rng(seed), n = 300, xs = Float64Array.from({ length: n }, () => rng.gauss() * 260 + 400), ys = Float64Array.from({ length: n }, () => rng.gauss() * 160 + 300)
    const top = 250, cells = new Voronoi().cells(xs, ys, n, -50, top, 900, 700)          // a box edge that cuts through the cloud: many slivers along it
    for (let i = 0; i < n; i++) {
      const p = cells[i]; if (!p) continue
      for (const d of [2, 4, 7]) { const q = inset(p, d, xs[i], ys[i]); if (!q) continue; checked++; assert.ok(inside(p, q), `cell ${i}, inset ${d}: a vertex is outside its cell`); assert.ok(Math.min(...q.filter((_, k) => k % 2)) >= top - 0.05, 'above the top edge') }
    }
  }
  assert.ok(checked > 400)
})

test('a big cell is never dropped: cells whose centre is above the box (under the top bar) still get their inset', () => {
  const rng = new Rng(31), n = 260, xs = Float64Array.from({ length: n }, () => rng.float() * 900), ys = Float64Array.from({ length: n }, () => rng.float() * 700 - 120)
  const top = 100, cells = new Voronoi().cells(xs, ys, n, 0, top, 900, 580); let big = 0, dropped = 0, above = 0
  for (let i = 0; i < n; i++) { const p = cells[i]; if (!p || area(p) < 600) continue; big++; if (ys[i] < top) above++; if (!inset(p, 5, xs[i], ys[i])) dropped++ }
  assert.ok(above > 5, 'the layout must have cells with their centre above the box'); assert.equal(dropped, 0, `${dropped} of ${big} big cells were dropped`)
})
