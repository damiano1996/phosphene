import { readFileSync } from 'node:fs'
import { Atlas } from '../js/core/atlas.js'
import { Rng } from '../js/core/rng.js'
export const atlas = Atlas.parse(readFileSync(new URL('../../atlas/atlas.tsv', import.meta.url), 'utf8'))
export const area = p => { let a = 0; const m = p.length / 2; for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1] } return Math.abs(a) / 2 }
export const catOf = (n, at = atlas) => at.categoryOf(at.nearestConcept(n.z))
export { Rng }
