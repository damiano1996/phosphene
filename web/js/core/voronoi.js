// @ts-check
/**
 * Voronoi cells of a point set, clipped to a rectangle. Each cell starts as the rectangle and is cut by the perpendicular bisector with its nearest sites, nearest
 * first, stopping as soon as no farther site can reach it. A cell is a flat array x0,y0,x1,y1,... in order around the cell. The nearest sites are found with a sweep
 * over the sites sorted by x. A true neighbour can be as far as the 30th-nearest site in an uneven layout (measured), so k = 32.
 */
export class Voronoi {
  constructor(k = 32) { this.k = k; /** mean distance from each site to its six nearest (smooth where two cells swap neighbours) */ this.spacing = new Float64Array(0) }

  /** @returns {(number[]|null)[]} */
  cells(xs, ys, n, left, top, right, bottom) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b)
    const rank = new Int32Array(n); for (let p = 0; p < n; p++) rank[order[p]] = p
    if (this.spacing.length < n) this.spacing = new Float64Array(n)
    const out = new Array(n)
    for (let i = 0; i < n; i++) {
      let kk = Math.min(this.k, n - 1), poly
      for (;;) {
        const bd = new Float64Array(kk), bi = new Int32Array(kk)
        const cnt = this.nearest(i, kk, xs, ys, n, order, rank, bd, bi)
        { let s = 0; const m = Math.min(6, cnt); for (let q = 0; q < m; q++) s += Math.sqrt(bd[q]); this.spacing[i] = m > 0 ? s / m : 1 }
        const res = this.clip(xs[i], ys[i], xs, ys, bi, bd, cnt, left, top, right, bottom)
        poly = res[0]
        // the cell still reaches past the bisector of the farthest neighbour looked at: a site not looked at could cut it
        if (cnt < kk || cnt >= n - 1 || res[1]) break
        kk = Math.min(n - 1, kk * 4)
      }
      out[i] = poly
    }
    return out
  }

  nearest(i, kk, xs, ys, n, order, rank, bd, bi) {
    let cnt = 0; const x = xs[i], y = ys[i]; let l = rank[i] - 1, r = rank[i] + 1
    while (l >= 0 || r < n) {
      const takeLeft = l < 0 ? false : r >= n ? true : (x - xs[order[l]]) <= (xs[order[r]] - x)
      const j = order[takeLeft ? l : r], dx = xs[j] - x
      if (cnt === kk && dx * dx >= bd[kk - 1]) { if (takeLeft) l = -1; else r = n; continue }
      const dy = ys[j] - y, d2 = dx * dx + dy * dy
      if (cnt < kk || d2 < bd[kk - 1]) {
        let p = cnt < kk ? cnt++ : kk - 1
        while (p > 0 && bd[p - 1] > d2) { bd[p] = bd[p - 1]; bi[p] = bi[p - 1]; p-- }
        bd[p] = d2; bi[p] = j
      }
      if (takeLeft) l--; else r++
    }
    return cnt
  }

  clip(x, y, xs, ys, bi, bd, cnt, l, t, r, b) {
    let poly = [l, t, r, t, r, b, l, b], maxR2 = 0
    for (let q = 0; q < 4; q++) { const dx = poly[2 * q] - x, dy = poly[2 * q + 1] - y; maxR2 = Math.max(maxR2, dx * dx + dy * dy) }
    for (let q = 0; q < cnt; q++) {
      if (bd[q] / 4 > maxR2) break
      const j = bi[q], nx = xs[j] - x, ny = ys[j] - y, c = nx * (x + xs[j]) / 2 + ny * (y + ys[j]) / 2
      const cut = this.cut(poly, nx, ny, c); if (cut === null) return [null, true]
      poly = cut; maxR2 = 0
      for (let v = 0; v < poly.length / 2; v++) { const dx = poly[2 * v] - x, dy = poly[2 * v + 1] - y; maxR2 = Math.max(maxR2, dx * dx + dy * dy) }
    }
    return [poly, cnt === 0 || bd[cnt - 1] / 4 > maxR2]
  }

  cut(poly, nx, ny, c) {
    const m = poly.length / 2, out = []
    for (let i = 0; i < m; i++) {
      const ax = poly[2 * i], ay = poly[2 * i + 1], bx = poly[2 * ((i + 1) % m)], by = poly[2 * ((i + 1) % m) + 1]
      const da = nx * ax + ny * ay - c, db = nx * bx + ny * by - c
      if (da <= 0) out.push(ax, ay)
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push(ax + (bx - ax) * t, ay + (by - ay) * t) }
    }
    return out.length < 6 ? null : out
  }
}
