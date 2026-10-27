// Fetches the uv binary for a platform into stage/uv:  node scripts/download-uv.js [linux|win|mac]  (default: this one)
// uv is what installs Python and the engine on the person's computer, so the launcher needs no Python of its own.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process')
const UV_VERSION = '0.5.28'
const TARGETS = {
  linux: { asset: 'uv-x86_64-unknown-linux-gnu.tar.gz', bin: 'uv' },
  win: { asset: 'uv-x86_64-pc-windows-msvc.zip', bin: 'uv.exe' },
  mac: { asset: 'uv-aarch64-apple-darwin.tar.gz', bin: 'uv' },
}
const here = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform]
const name = process.argv[2] || here, t = TARGETS[name]
if (!t) throw new Error(`unknown platform ${name}; use linux, win or mac`)
const out = path.join(__dirname, '..', 'stage', 'uv'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-')), archive = path.join(tmp, t.asset)
;(async () => {
  const res = await fetch(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${t.asset}`)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  execFileSync('tar', ['-xf', archive, '-C', tmp])                 // bsdtar (Windows, macOS) and GNU tar (Linux) both read .zip / .tar.gz
  const found = (function find(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const r = find(p); if (r) return r } else if (e.name === t.bin) return p } })(tmp)
  if (!found) throw new Error(`${t.bin} not found in the archive`)
  fs.copyFileSync(found, path.join(out, t.bin)); fs.chmodSync(path.join(out, t.bin), 0o755)
  console.log(`uv ${UV_VERSION} (${name}) -> ${out}`)
})().catch(e => { console.error(e.message); process.exit(1) })
