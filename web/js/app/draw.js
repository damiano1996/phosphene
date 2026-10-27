// @ts-check
// The small drawings over the mosaic: buttons, the step badge, the note that follows a button. Pure canvas code: everything they need is passed in (`d` is the density, device pixels per CSS pixel,
// which turns the fixed sizes of the controls into the same size on every screen).

const HEART = new Path2D('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z')
const FONT = '-apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'

export function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill() }

/** A heart of this size, filled or (with `stroke`) outlined. */
export function heart(ctx, cx, cy, size, color, alpha, stroke) {
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24); ctx.globalAlpha = alpha
  if (stroke == null) { ctx.fillStyle = color; ctx.fill(HEART) } else { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.lineJoin = 'round'; ctx.stroke(HEART) }
  ctx.restore()
}

/** A heart that is white with a soft shadow, or red and filled once the picture is saved. */
export function drawHeartButton(ctx, x, y, a, d, saved) {
  const sz = 26 * d
  circle(ctx, x, y + d, 22 * d, `rgba(0,0,0,${0.22 * a})`)
  if (saved) heart(ctx, x, y, sz, '#ff3040', a); else heart(ctx, x, y, sz, '#fff', a, 2.4)
}

/** A small cross beside the heart: "not for me". `b` is {x, y, a}. */
export function drawDismissButton(ctx, b, d) {
  const r = 15 * d; circle(ctx, b.x, b.y + d, r + 3 * d, `rgba(0,0,0,${0.22 * b.a})`)
  ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${b.a})`; ctx.lineWidth = 2.4 * d; ctx.lineCap = 'round'; const s = 6 * d
  ctx.beginPath(); ctx.moveTo(b.x - s, b.y - s); ctx.lineTo(b.x + s, b.y + s); ctx.moveTo(b.x + s, b.y - s); ctx.lineTo(b.x - s, b.y + s); ctx.stroke(); ctx.restore()
}

/** An arrow into a tray: "keep this picture as a file". */
export function drawDownloadButton(ctx, b, d) {
  const r = 15 * d; circle(ctx, b.x, b.y + d, r + 3 * d, `rgba(0,0,0,${0.22 * b.a})`)
  ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${b.a})`; ctx.lineWidth = 2.4 * d; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const s = 6 * d
  ctx.beginPath(); ctx.moveTo(b.x, b.y - s); ctx.lineTo(b.x, b.y + s * 0.6); ctx.moveTo(b.x - s * 0.8, b.y - s * 0.2); ctx.lineTo(b.x, b.y + s * 0.6); ctx.lineTo(b.x + s * 0.8, b.y - s * 0.2)
  ctx.moveTo(b.x - s, b.y + s); ctx.lineTo(b.x + s, b.y + s); ctx.stroke(); ctx.restore()
}

/** Next to the heart: how far the picture has got ("step 3/5" while it is drawn, a ring that fills), or how many steps made it. `info` is [step, total]. */
export function drawStepBadge(ctx, info, left, y, a, d, compact = false) {      // `compact` (a narrow screen): just "3/5", so it does not run over the neighbours
  const [step, total] = info, label = compact ? `${step}/${total}` : `step ${step}/${total}`
  ctx.save(); ctx.font = `700 ${13 * d}px ${FONT}`
  const tw = ctx.measureText(label).width, h = 32 * d, iw = 18 * d, wd = 10 * d + iw + 6 * d + tw + 12 * d
  ctx.fillStyle = `rgba(0,0,0,${0.42 * a})`; ctx.beginPath(); ctx.roundRect(left, y - h / 2, wd, h, h / 2); ctx.fill()
  const rx = left + 10 * d + iw / 2, rr = 7.5 * d
  ctx.lineWidth = 2.6 * d; ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`; ctx.beginPath(); ctx.arc(rx, y, rr, 0, 2 * Math.PI); ctx.stroke()
  ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(rx, y, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(step / Math.max(total, 1), 1)); ctx.stroke()
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.textBaseline = 'middle'; ctx.fillText(label, left + 10 * d + iw + 6 * d, y + 0.5 * d); ctx.restore()
}

/** A short note by the button that was pressed. `t` is {text, t0, x, y}; returns false once it is over. */
export function drawToast(ctx, t, now, d) {
  const age = now - t.t0; if (age > 1800) return false
  const a = age < 1300 ? 1 : 1 - (age - 1300) / 500
  ctx.save(); ctx.font = `700 ${13 * d}px ${FONT}`; const tw = ctx.measureText(t.text).width, h = 30 * d, wd = tw + 28 * d, y = t.y - 46 * d - Math.min(1, age / 200) * 6 * d
  ctx.fillStyle = `rgba(20,18,28,${0.82 * a})`; ctx.beginPath(); ctx.roundRect(t.x - wd / 2, y - h / 2, wd, h, h / 2); ctx.fill()
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(t.text, t.x, y + 0.5 * d); ctx.restore()
  return true
}
