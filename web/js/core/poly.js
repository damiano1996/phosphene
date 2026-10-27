// @ts-check
/** Helpers for the convex polygons of the tessellation (flat arrays x0,y0,x1,y1,...). */

export function area(p) {
  let a = 0; const m = p.length / 2
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1] }
  return Math.abs(a) / 2
}

const toPts = p => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]); return o }
const fromPts = pts => { const o = new Array(pts.length * 2); pts.forEach((q, i) => { o[2 * i] = q[0]; o[2 * i + 1] = q[1] }); return o }

/** Drops vertices closer than 1 px to the previous one, and vertices that lie on a straight line between their neighbours (clipping leaves both). */
export function clean(p) {
  const pts = toPts(p); let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
      const sin = l1 < 1e-6 || l2 < 1e-6 ? 0 : Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) / (l1 * l2)
      if (l1 < 1 || sin < 0.002) { pts.splice(i, 1); changed = true; break }
    }
  }
  return fromPts(pts)
}

/** Distance from (x, y), inside the polygon, to its nearest edge. */
export function inradius(p, x, y) {
  let best = Infinity; const m = p.length / 2
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey)
    if (l < 1e-6) continue
    best = Math.min(best, Math.abs((x - p[2 * i]) * ey - (y - p[2 * i + 1]) * ex) / l)
  }
  return best
}

/** Replaces every edge shorter than minLen by the point where its two neighbouring edges meet. */
function collapseShortEdges(p, minLen) {
  const pts = toPts(p)
  while (pts.length > 3) {
    let worst = -1, wl = minLen
    for (let i = 0; i < pts.length; i++) { const b = pts[i], c = pts[(i + 1) % pts.length], l = Math.hypot(c[0] - b[0], c[1] - b[1]); if (l < wl) { wl = l; worst = i } }
    if (worst < 0) break
    const n = pts.length, i1 = worst, i2 = (worst + 1) % n
    const b = pts[i1], c = pts[i2]
    const np = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]          // the middle of the short edge: it is on the cell. (Extending the two edges next to it until they meet would put the new vertex OUTSIDE the cell, and past the edge of the box.)
    pts[i1] = np; pts.splice(i2, 1)
  }
  return fromPts(pts)
}

/**
 * The polygon moved inwards by d along every edge (mitred corners). (x, y) is a point inside it (the cell's site), used to keep d below what would make the polygon
 * vanish. Returns null if there is nothing left.
 */
export function inset(poly, d, x, y) {
  const cell = clean(poly)
  if (cell.length / 2 < 3 || area(cell) < 4) return null            // a sliver has nothing left to draw
  const siteIn = inside(cell, [x, y])                                  // the centre of a cell above the top bar is outside the part of it that is shown: nothing to keep around then
  for (let k = 0; k < 4; k++) {                                       // the inset must lie inside the cell: if the mitres made it stick out, try a smaller one
    const q = insetOnce(cell, d / (1 << k), x, y)
    if (q && inside(cell, q) && (!siteIn || inside(q, [x, y]))) return q          // inside the cell, and still around its centre when the centre is in it
  }
  return null
}

/** Every vertex of q is on the inner side of every edge of the convex polygon p (a hair of tolerance). */
function inside(p, q) {
  const m = p.length / 2; let sign = 0
  for (let i = 0; i < m; i++) { const j = (i + 1) % m, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1]; sign += (ex * (p[2 * ((j + 1) % m) + 1] - p[2 * j + 1]) - ey * (p[2 * ((j + 1) % m)] - p[2 * j])) > 0 ? 1 : -1 }
  const s = sign >= 0 ? 1 : -1
  for (let v = 0; v < q.length / 2; v++) for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey) || 1
    if (s * (ex * (q[2 * v + 1] - p[2 * i + 1]) - ey * (q[2 * v] - p[2 * i])) / l < -0.01) return false
  }
  return true
}

function insetOnce(poly, d, x, y) {
  let p = poly
  const dd = Math.min(d, 0.8 * inradius(p, x, y))
  if (dd <= 0) return p
  p = collapseShortEdges(p, 2.2 * dd)
  const m = p.length / 2
  if (m < 3) return null
  const nx = new Array(m), ny = new Array(m)
  let cx = 0, cy = 0; for (let i = 0; i < m; i++) { cx += p[2 * i]; cy += p[2 * i + 1] } cx /= m; cy /= m
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1]; let l = Math.hypot(ex, ey); if (l < 1e-6) l = 1
    let ax = -ey / l, ay = ex / l
    if (ax * (cx - p[2 * i]) + ay * (cy - p[2 * i + 1]) < 0) { ax = -ax; ay = -ay }
    nx[i] = ax; ny[i] = ay
  }
  const out = new Array(p.length)
  for (let i = 0; i < m; i++) {
    const h = (i + m - 1) % m
    const den = Math.max(1 + nx[h] * nx[i] + ny[h] * ny[i], 0.25)
    out[2 * i] = p[2 * i] + (nx[h] + nx[i]) * dd / den; out[2 * i + 1] = p[2 * i + 1] + (ny[h] + ny[i]) * dd / den
  }
  return area(out) < 1 ? null : out
}
