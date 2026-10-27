// The launcher: install the engine once (with the uv it carries), then start it and open the page. It does no more than that.
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs'), path = require('path')
const plan = require('./plan')


const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'stage')
const P = () => plan.paths({ resources, userData: app.getPath('userData') })
let win, engine = null, url = null

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload)
// the engine's address carries the key (?t=...): it must not show in a log the person may paste into an issue
const log = line => send('log', String(line).replace(/([?&]t=)[0-9a-f]+/gi, '$1…'))
// An Apple-Silicon Mac counts as a supported graphics chip (Metal).
const hasNvidia = () => { if (process.platform === 'darwin') return process.arch === 'arm64'; return nvidiaPresent() }
const nvidiaPresent = () => { try { return spawnSync('nvidia-smi', ['-L'], { timeout: 8000 }).status === 0 } catch { return false } }
const installed = () => fs.existsSync(P().marker) && fs.existsSync(P().python)
const status = () => ({ installed: installed(), running: !!engine, url, version: app.getVersion(), nvidia: hasNvidia() })

function run(step) {
  return new Promise((resolve, reject) => {
    log(`\n== ${step.label}`)
    const c = spawn(step.cmd, step.args, { env: { ...process.env, ...step.env }, windowsHide: true })
    c.stdout.on('data', d => log(String(d))); c.stderr.on('data', d => log(String(d)))
    const t0 = Date.now(), beat = setInterval(() => log(`   … still working (${Math.round((Date.now() - t0) / 1000)} s; uv shows no progress here, a download of several GB takes a few minutes)`), 15000)
    c.on('error', e => { clearInterval(beat); reject(e) })
    c.on('exit', code => { clearInterval(beat); code === 0 ? resolve() : reject(new Error(`${step.label} failed (exit ${code})`)) })
  })
}

async function install() {
  const p = P(), nv = hasNvidia()
  fs.rmSync(p.venv, { recursive: true, force: true })
  fs.mkdirSync(p.data, { recursive: true })
  for (const step of plan.installSteps(p, { hasNvidia: nv, version: app.getVersion() })) await run(step)
  fs.writeFileSync(p.marker, JSON.stringify({ version: app.getVersion(), nvidia: nv, at: new Date().toISOString() }))
  log('\nInstalled.')
}

function launch() {
  const p = P(); if (engine) return
  url = null
  engine = spawn(p.python, plan.engineArgs(p), { windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1' } })
  const onData = d => { for (const line of String(d).split(/\r?\n/)) { if (!line) continue; log(line); const u = plan.findUrl(line); if (u && !url) { url = u; shell.openExternal(u); send('status', status()) } } }
  engine.stdout.on('data', onData); engine.stderr.on('data', onData)
  engine.on('exit', code => { log(`\nThe engine stopped (${code}).`); engine = null; url = null; send('status', status()) })
  send('status', status())
}

function stop() { if (engine) engine.kill() }

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 760, height: 560, title: 'Phosphene', icon: path.join(__dirname, '..', 'build', 'icon.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } })
  // the program runs with --no-sandbox on Linux (see scripts/after-pack.js), so the window may only ever show its own page
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.loadFile(path.join(__dirname, 'index.html'))
  ipcMain.handle('status', status)
  ipcMain.handle('install', async () => { try { await install() } catch (e) { log(`\n${e.message}`); dialog.showErrorBox('Install failed', e.message) } send('status', status()) })
  ipcMain.handle('launch', launch)
  ipcMain.handle('stop', stop)
  ipcMain.handle('open', () => url && shell.openExternal(url))
})
app.on('window-all-closed', () => { stop(); app.quit() })
