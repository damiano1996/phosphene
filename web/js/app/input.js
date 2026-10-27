// @ts-check
import { T } from '../core/tuning.js'

/** Pointer input for whichever scene is current (a fresh mosaic replaces the scene; the listeners stay). Positions are in canvas pixels. */
export function attachInput(canvas, getScene) {
  let down = null
  const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height] }
  canvas.addEventListener('pointerdown', e => { getScene()?.touch(); if (e.button !== 0 || !getScene()) return; canvas.setPointerCapture(e.pointerId); const [x, y] = pos(e); down = { x, y, lx: x, ly: y, moved: false } })
  canvas.addEventListener('pointermove', e => {
    const s = getScene(); s?.touch(); if (!down || !s) return
    const [x, y] = pos(e)
    if (!down.moved && Math.hypot(x - down.x, y - down.y) > (e.pointerType === 'touch' ? 10 : 6) * s.dens) { down.moved = true; if (s.viewerK < 0) { s.dragging = true; s.trans = null } }      // (a finger moves a little even when it only taps)
    if (s.dragging) { const k = 1 / (s.u * T.LENS_A * 0.8); s.camX -= (x - down.lx) * k; s.camY -= (y - down.ly) * k }
    down.lx = x; down.ly = y
  })
  canvas.addEventListener('pointerup', e => {
    const s = getScene(); if (!down || !s) { down = null; return }
    const [x, y] = pos(e), moved = down.moved; down = null
    if (s.dragging) { s.dragging = false; s.settle() } else if (!moved) s.click(x, y)
  })
  canvas.addEventListener('pointercancel', () => { const s = getScene(); down = null; if (s && s.dragging) { s.dragging = false; s.settle() } })
  addEventListener('keydown', e => { getScene()?.touch(); if (e.key === 'Escape') getScene()?.closeViewer() })
}
