// What the simulators share: the content they load, the overrides of the tuning numbers from the environment, and the little statistics they print.
//   T='{"LENGTHSCALE":1.6}' node web/tools/simulate-discover.js     overrides numbers of web/js/core/tuning.js for one run (to see what a change does before making it)
import { readFileSync } from 'node:fs'
import { Atlas } from '../js/core/atlas.js'
import { Facets } from '../js/core/facets.js'
import { T } from '../js/core/tuning.js'

const content = name => readFileSync(new URL(`../../atlas/${name}`, import.meta.url), 'utf8')

export const loadAtlas = () => Atlas.parse(content('atlas.tsv'))
export const loadFacets = () => Facets.parse(content('facets.json'))

/** Applies the overrides given as JSON in the environment variable T. */
export function applyTuning(env = process.env) { for (const [k, v] of Object.entries(JSON.parse(env.T ?? '{}'))) T[k] = v }

/** The two numbers every simulator takes: how many simulated people, and how many steps each takes. */
export const runSize = (defaultSeeds, defaultSteps) => [+(process.argv[2] ?? defaultSeeds), +(process.argv[3] ?? defaultSteps)]

export const mean = a => { const v = a.filter(x => !Number.isNaN(x)); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN }
/** A share as a percentage, right-aligned (`gap` is what stands for "no data"). */
export const pct = (x, gap = '  -- ', tail = '% ') => (Number.isNaN(x) ? gap : (100 * x).toFixed(0).padStart(3) + tail)
