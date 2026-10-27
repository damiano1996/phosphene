const test = require('node:test'), assert = require('node:assert')
const plan = require('../src/plan')

test('torch comes from the CUDA index with an NVIDIA card, the CPU one without', () => {
  assert.match(plan.torchIndex({ hasNvidia: true, platform: 'linux' }), /cu\d+$/)
  assert.match(plan.torchIndex({ hasNvidia: false, platform: 'win32' }), /cpu$/)
})
test('paths: the python of the venv differs by system', () => {
  assert.match(plan.paths({ resources: '/r', userData: '/u', platform: 'linux' }).python, /bin\/python$/)
  assert.match(plan.paths({ resources: 'C:\\r', userData: 'C:\\u', platform: 'win32' }).uv, /uv\.exe$/)
})
test('install: python, then torch, then the engine', () => {
  const steps = plan.installSteps(plan.paths({ resources: '/r', userData: '/u', platform: 'linux' }), { hasNvidia: true, version: '1', platform: 'linux' })
  assert.deepEqual(steps.map(s => s.args[0] + ' ' + s.args[1]), ['venv --python', 'pip install', 'pip install'])
  assert.ok(steps[1].args.includes('torch') && steps[1].args.includes('--index-url'))
  assert.ok(steps[2].args.at(-1).endsWith('engine'))
  assert.ok(steps[2].args.includes('-c'), 'the engine install is constrained to the tested versions')
  assert.ok(steps.every(s => s.env.UV_CACHE_DIR.startsWith('/u') && s.env.UV_PYTHON_INSTALL_DIR.startsWith('/u')), 'python and the cache stay in the app folder')
})
test('the engine prints its address once', () => {
  assert.equal(plan.findUrl('Phosphene is at http://127.0.0.1:8780/?t=abc'), 'http://127.0.0.1:8780/?t=abc')
  assert.equal(plan.findUrl('loading'), null)
})
test('on a Mac torch comes from PyPI (it has Metal); no index is passed', () => {
  assert.equal(plan.torchIndex({ hasNvidia: true, platform: 'darwin' }), null)
  const steps = plan.installSteps(plan.paths({ resources: '/r', userData: '/u', platform: 'darwin' }), { hasNvidia: true, version: '1', platform: 'darwin' })
  assert.ok(!steps[1].args.includes('--index-url')); assert.match(steps[1].label, /Mac/)
})
