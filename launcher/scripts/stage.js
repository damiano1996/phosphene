// Copies what the launcher carries into stage/: the engine, the page and the atlas (uv is put there by download-uv.js).
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', '..'), out = path.join(__dirname, '..', 'stage', 'app')
fs.rmSync(out, { recursive: true, force: true })
const skip = n => ['.venv', '__pycache__', 'tests', 'test', 'tools', 'node_modules', '.dev-data', 'uv.lock'].includes(n) || n.endsWith('.pyc')
for (const d of ['engine', 'web', 'atlas']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true, filter: s => !skip(path.basename(s)) })
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
fs.copyFileSync(path.join(__dirname, '..', 'constraints.txt'), path.join(out, 'constraints.txt'))   // see scripts/update-constraints.sh
if (!fs.existsSync(path.join(__dirname, '..', 'stage', 'uv'))) console.warn('stage/uv is missing: run  npm run download')
console.log('staged ->', out)
