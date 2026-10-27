// What the launcher runs, as plain data: no Electron in here, so it is tested without a window.
const path = require('path')

// PyTorch wheels come from its own index, one per kind of card. The default wheels on PyPI are CPU-only on Windows.
const TORCH_INDEX = { cuda: 'https://download.pytorch.org/whl/cu124', cpu: 'https://download.pytorch.org/whl/cpu' }

// On a Mac the wheels on PyPI already carry Apple-GPU (Metal) support: no special index.
function torchIndex({ hasNvidia, platform = process.platform }) { return platform === 'darwin' ? null : hasNvidia ? TORCH_INDEX.cuda : TORCH_INDEX.cpu }

function paths({ resources, userData, platform = process.platform }) {
  const path = platform === 'win32' ? require('path').win32 : require('path').posix        // joins with the separators of the system the paths are for
  const venv = path.join(userData, 'venv')
  return {
    uv: path.join(resources, 'uv', platform === 'win32' ? 'uv.exe' : 'uv'),
    app: path.join(resources, 'app'),
    venv,
    python: platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'),
    constraints: path.join(resources, 'app', 'constraints.txt'),
    cache: path.join(userData, 'uv-cache'),
    pythons: path.join(userData, 'python'),
    marker: path.join(userData, 'installed.json'),
    data: path.join(userData, 'data'),
  }
}

// The steps of an install, in order. uv fetches Python itself; torch goes first so the engine's own requirement is already met.
function installSteps(p, { hasNvidia, version, platform = process.platform }) {
  const path = platform === 'win32' ? require('path').win32 : require('path').posix
  const index = torchIndex({ hasNvidia, platform }), what = platform === 'darwin' ? 'for your Mac' : hasNvidia ? 'for your NVIDIA card' : null
  // Python and uv's cache go in the app's own folder, so deleting it removes everything; the versions of the engine's libraries are pinned by constraints.txt (made from engine/uv.lock).
  const env = { UV_HTTP_TIMEOUT: '1200', UV_PYTHON_PREFERENCE: 'only-managed', UV_CACHE_DIR: p.cache, UV_PYTHON_INSTALL_DIR: p.pythons }
  return [
    { label: 'Setting up Python', cmd: p.uv, args: ['venv', '--python', '3.12', p.venv], env },
    { label: what ? `Installing PyTorch ${what} (several GB)` : 'Installing PyTorch (no NVIDIA card found: pictures cannot be made on this computer yet)', cmd: p.uv, args: ['pip', 'install', '--python', p.python, 'torch', ...(index ? ['--index-url', index] : [])], env },
    { label: 'Installing the engine', cmd: p.uv, args: ['pip', 'install', '--python', p.python, '-c', p.constraints, path.join(p.app, 'engine')], env },
  ].map(s => ({ ...s, version }))
}

function engineArgs(p) {
  return ['-m', 'phosphene_engine', '--web', '--no-open', '--atlas-dir', path.join(p.app, 'atlas'), '--web-dir', path.join(p.app, 'web'), '--data-dir', p.data]
}

// The engine prints "Phosphene is at http://127.0.0.1:8780/?t=KEY" once it listens.
function findUrl(line) { const m = /Phosphene is at (http:\/\/\S+)/.exec(line); return m ? m[1] : null }

module.exports = { TORCH_INDEX, torchIndex, paths, installSteps, engineArgs, findUrl }
