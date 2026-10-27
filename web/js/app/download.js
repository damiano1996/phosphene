// @ts-check
/** Saves a picture as a JPEG file: the pixels of the bitmap, at their full size. */
export function downloadPicture(bitmap, seed) {
  const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d').drawImage(bitmap, 0, 0)
  c.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `phosphene-${seed}.jpg`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }, 'image/jpeg', 0.95)
}
