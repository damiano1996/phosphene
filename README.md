<p align="center">
  <img src="web/logo.svg" alt="" width="84">
</p>

<h1 align="center">Phosphene</h1>

<p align="center">
  An endless mosaic of pictures, drawn on your own graphics card while you look.<br>
  It learns what you like.
</p>

<p align="center">
  <a href="https://github.com/damiano1996/phosphene/actions/workflows/ci.yml"><img src="https://github.com/damiano1996/phosphene/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/damiano1996/phosphene/releases/latest"><img src="https://img.shields.io/github/v/release/damiano1996/phosphene?include_prereleases&sort=semver" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0"></a>
  <img src="https://img.shields.io/badge/Linux-tested-success" alt="Linux: tested">
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS-from%20source-lightgrey" alt="Windows and macOS: from source">
</p>

<p align="center">
  <a href="docs/media/demo.mp4"><img src="docs/media/demo-preview.gif" alt="Phosphene: dragging over the mosaic and going to a picture" width="800"></a><br>
  <sub><a href="docs/media/demo.mp4">Watch the full demo</a> (2.5 minutes, with voice)</sub>
</p>

## What it is

You drag over a mosaic that never ends. Every picture is made on the spot by an image model that runs on your GPU. What you go to, linger on, heart or cross out teaches the app your taste, and the pictures it makes next follow it.

- **Private.** Nothing you do leaves your computer. The engine listens on `127.0.0.1` only, behind a key. The only downloads are the runtime (once) and the models you pick.
- **Runs on a small card.** From SD-Turbo (about 3 GB of video memory) to FLUX.1 schnell, on a 4 GB laptop GPU. You choose the model that fits your hardware.
- **Learns without being told.** Pick a few categories you are curious about and look around. It finds a taste that crosses them, down to the finer kind of a thing (the Dolomites, not just "mountains") and to looks (golden hour, fog, pale rock).
- **Shows what it learned.** A map of your taste, the looks you favour, every signal it rests on. You can pause it, export it or forget it.
- **Extensible.** Add a model in a JSON file, a backend as a class, a picture reader as a catalogue entry ([docs/EXTENDING.md](docs/EXTENDING.md)).

## Download

| System | Download | Status |
|---|---|---|
| Ubuntu / Debian | [Phosphene-linux-amd64.deb](https://github.com/damiano1996/phosphene/releases/latest/download/Phosphene-linux-amd64.deb) | tested, NVIDIA card |
| Any Linux | [Phosphene-linux-x86_64.AppImage](https://github.com/damiano1996/phosphene/releases/latest/download/Phosphene-linux-x86_64.AppImage) | tested, NVIDIA card |

All releases: [github.com/damiano1996/phosphene/releases](https://github.com/damiano1996/phosphene/releases).

**Windows and macOS:** no installer yet. The engine is written to run on both (Windows with an NVIDIA card; macOS with Apple Silicon) but has not been tried there. You can [run from source](#run-from-source) and report what happens.

**What you need:** an NVIDIA graphics card with a recent driver (4 GB is enough for the small models). About 10 GB of free disk for the install, plus the models you pick. A modern browser, tested in Chrome. You do not need Python, Node or uv: the installer brings what it needs.

## Install and run

1. **Open the installer.**
   - Ubuntu / Debian: `sudo apt install ./Phosphene-linux-amd64.deb`, then open **Phosphene** from the menu.
   - Other Linux: `chmod +x Phosphene-linux-x86_64.AppImage && ./Phosphene-linux-x86_64.AppImage`.
2. **Press Install, once.** It fetches Python, PyTorch and the engine into the app's own folder. This takes a few minutes and several GB. Nothing is installed system-wide.
3. **Press Launch.** Your browser opens on the page. The first run asks you to pick a model (the recommended one for your card is preselected), then what you are curious about, and draws the first pictures.

Press **Stop** or close the window to stop the engine. To start over, delete the app's folder, `~/.config/Phosphene`. How the installer works: [launcher/README.md](launcher/README.md).

### If something goes wrong

| What you see | What to do |
|---|---|
| "Something else is using the GPU" | Another program holds the video memory (a dictation app, a game, another model server). Close it, or pick a smaller model. The smallest needs about 3 GB free. |
| The install seems stuck on PyTorch | It is downloading several GB and prints nothing for a few minutes. The log shows "still working" every 15 seconds. |
| The install fails | Check you have 10 GB free. Press **Install** again: it starts clean. |
| The AppImage does not start | Install the `.deb` instead, or run it from a terminal to see the error. |
| "No supported graphics card found" | An NVIDIA card with its driver is needed (or a Mac with Apple Silicon, from source). |

Found a bug? [Open an issue](https://github.com/damiano1996/phosphene/issues/new/choose) with the log from the installer window.

## Models

Phosphene downloads a model once, from its original source, the first time you choose it. You can add more or delete them later in the app. Pick one that fits your card:

<!-- models:start -->
| Model | Download | GPU memory | Licence |
|---|---|---|---|
| **SD-Turbo** | 2.5 GB | 2.9 GB | Stability AI licence |
| **Stable Diffusion 1.5 + LCM** | 2.2 GB | 2.9 GB | CreativeML OpenRAIL-M |
| **SDXS-512 DreamShaper** | 1.8 GB | 1.5 GB | OpenRAIL++ |
| **SDXL-Turbo** | 6.8 GB | 3.3 GB | Stability AI licence |
| **RealVisXL V5 Lightning** | 6.8 GB | 3.3 GB | OpenRAIL++ |
| **DreamShaper XL Lightning** | 6.8 GB | 3.3 GB | OpenRAIL++ |
| **SANA Sprint 1.6B** | 9.5 GB | 2.7 GB | Apache 2.0 |
| **FLUX.1 schnell** | 16.5 GB | 2.2 GB | Apache 2.0 |
<!-- models:end -->

**The models are not part of this repository and keep their own licences.** Some restrict commercial use of the pictures they draw. Check a model's terms before you use its pictures commercially. Each model's card in the app links to its page.

## How it works

```
 browser (web/)  ──── localhost, key ────▶  engine (engine/, Python + PyTorch)
 the mosaic, the recommender,                one picture per request, from the model on your GPU
 the screens; plain ES modules               models, downloads, the optional reader of pictures
```

The mosaic is an endless spiral of cells. Each cell is a point on a map of 526 concepts (`atlas/`) plus a **seed** that also says which finer kind of the concept and which looks to ask for. A taste model decides what the next cells are.

### How it learns

The recommender runs in the page, not on a server, and learns only from what you do:

| You | It counts as |
|---|---|
| click a picture | a choice |
| open it large | a stronger choice |
| heart it | the strongest (un-hearting takes it back, it is not a dislike) |
| cross it out ("not for me") | a negative |
| rest on a picture | a weak one, only while you are really there (the camera is still, the page is visible, you touched it in the last 90 seconds) |

- **What it learns about.** The concept, the finer kind (the Dolomites, not just "mountains"), the prompt style (photo, close-up, painting), and how a picture looks: brightness, contrast, colour, warmth, detail, symmetry, light and shadow. The looks are measured in your browser on a tiny copy, and only the numbers are kept. An optional small model can also read each picture and add words (golden hour, fog), so it learns from what a picture shows and not only from what was asked.
- **The model.** A Gaussian-process preference model, fitted from "this one was chosen among these", and sampled by Thompson sampling: it draws a plausible taste from what it knows, so it follows what you like and still tries new things.
- **A sliding window.** Only the last 120 signals count, and a signal counts less the newer ones there are and the older it is (half-life 14 days). A changed taste takes over, and a few odd picks do not overturn an old one.
- **In the open.** Settings > "What it learned" shows the map of your taste, the looks and words it favours and every signal it rests on. You can forget a single signal, pause learning, export the data or forget it all. It is one JSON file on your computer.

The numbers are in `web/js/core/tuning.js`, and the simulators in `web/tools/` show what a change does. The reasoning is in [ADR 0007](docs/adr/0007-learning-in-the-open.md).

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and what it builds on: [ADR 0009](docs/adr/0009-prior-art.md).

## Run from source

For development, or if you prefer a terminal. You need [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/damiano1996/phosphene.git && cd phosphene
(cd engine && UV_HTTP_TIMEOUT=1200 uv sync)      # once; the long timeout keeps the big PyTorch download from failing
scripts/web.sh                                    # starts the engine, which serves the page, and opens it
```

The page is at `http://127.0.0.1:8780/`. The link printed at start contains the key, and opening that link once lets your browser in. Run from source, your data is kept in `~/.local/share/phosphene` (`--data-dir` changes it). The installed app keeps it in its own folder.

### Configure and extend

| You want to | Where |
|---|---|
| change the port, the data folder, the model loaded at start | [docs/CONFIGURATION.md](docs/CONFIGURATION.md) |
| add or change a model | `engine/src/phosphene_engine/catalog.json`, then [docs/EXTENDING.md](docs/EXTENDING.md) |
| add a backend or a picture reader | [docs/EXTENDING.md](docs/EXTENDING.md) |
| change what the mosaic can show (concepts, finer kinds, looks) | `atlas/` |
| tune the feel or the recommender | `web/js/core/tuning.js`, with the simulators in `web/tools/` |

### Layout

| | |
|---|---|
| `web/` | The page: the mosaic, the recommender (`js/core`, pure and tested), the screens (`js/app`). No build step. |
| `engine/` | The local server: models, pictures, readers, the HTTP API, and its tests. |
| `launcher/` | The installer app (Electron) that sets up and starts the engine. |
| `atlas/` | The content: the concept map, prompt templates, finer kinds, looks. |
| `docs/` | Architecture, configuration, extending, and the decision records (`adr/`). |
| `scripts/` | `web.sh` to start it, `check.sh` to run every check, smoke tests, the models table. |

### Test

```bash
scripts/check.sh                       # lint and tests of the page and the engine (no GPU needed)
(cd launcher && npm test)              # the installer's plan
scripts/smoke-engine.sh                # a real engine and model, a request of each kind (needs a GPU)
scripts/models-table.py --write        # refresh the models table above from the catalogue
```

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report a vulnerability privately, as described in [SECURITY.md](SECURITY.md). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

The code is [Apache-2.0](LICENSE). Libraries that ship with the page are listed in [THIRD_PARTY.md](THIRD_PARTY.md). Models keep their own licences (see [Models](#models)).

## Acknowledgements

Built on [PyTorch](https://pytorch.org), [diffusers](https://github.com/huggingface/diffusers), [uv](https://docs.astral.sh/uv/), [Preact](https://preactjs.com) and [htm](https://github.com/developit/htm), and on the open image models above. The installer follows the design of the [Invoke](https://github.com/invoke-ai/InvokeAI) launcher.
