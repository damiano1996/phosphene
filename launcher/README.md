# Phosphene launcher

The installer people download, in the way Invoke's launcher works: a small Electron app that carries [uv](https://docs.astral.sh/uv/) and the engine's source. **Install** (once) lets uv fetch
Python, PyTorch (CUDA when `nvidia-smi` answers, CPU otherwise) and the engine into the app's own folder; **Launch** starts the engine and opens the page in the browser. Nothing else to set up.

| System | File | State |
|---|---|---|
| Windows | `Phosphene-win-x64.exe` | builds, **not published**: unsigned, so SmartScreen blocks it. Never run on a real Windows machine |
| Linux | `Phosphene-linux-x86_64.AppImage`, `Phosphene-linux-amd64.deb` | built and run on Linux; needs an NVIDIA card |
| macOS | `Phosphene-mac-arm64.dmg` (Apple Silicon) | builds, **not published**: unsigned, so Gatekeeper blocks it. The engine's Apple-GPU (MPS) path has never run on a real Mac |

Unsigned builds: Windows shows a SmartScreen warning ("More info", "Run anyway"). macOS says the app is damaged or from an unidentified developer: drag it to Applications, then run `xattr -cr /Applications/Phosphene.app` once (or right-click, Open). Linux: `chmod +x` the AppImage, or install the `.deb`.

## Build

```bash
cd launcher && npm install
npm run download          # uv for this system (or: npm run download -- win)
npm run package           # stage the engine, page and atlas, then electron-builder -> dist/
npm test                  # the install plan, without a window
npm start                 # run from source (needs stage/, i.e. the two commands above once)
```

A tag `vX.Y.Z` runs `.github/workflows/release.yml`, which builds and publishes the Linux installers. To publish the others once they are signed, add them back to the matrix (see the comment in the workflow).

## Pinned versions

The installer applies `launcher/constraints.txt`, made from `engine/uv.lock` (without PyTorch and its CUDA libraries, which come from PyTorch's own index), so a fresh install gets the versions that were tested. After `uv lock` changes the lock, run `scripts/update-constraints.sh`.

## Where things go

The app's user-data folder (`~/.config/Phosphene`, `%APPDATA%\Phosphene`) holds `python/` and `uv-cache/` (what uv downloads), `venv/` (the engine), `data/` (your choices, saved pictures, models) and `installed.json`. Delete the folder to start over.
