// Linux: the program is replaced by a one-line script that starts the real one with --no-sandbox.
// An AppImage cannot carry Chromium's root-owned sandbox helper and recent Ubuntu forbids the fallback, so without the flag it aborts at start.
const fs = require('fs'), path = require('path')
exports.default = async ctx => {
  if (ctx.electronPlatformName !== 'linux') return
  const bin = path.join(ctx.appOutDir, ctx.packager.executableName)
  fs.renameSync(bin, bin + '.bin')
  fs.writeFileSync(bin, '#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/' + ctx.packager.executableName + '.bin" --no-sandbox "$@"\n', { mode: 0o755 })
}
