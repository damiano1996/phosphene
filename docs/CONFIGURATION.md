# Configuration

Almost everything is a choice made in the app (model, categories, picture size, sound, the reader). This page is what is set outside it.

## Starting the engine

`scripts/web.sh [options]` runs `python -m phosphene_engine --web --atlas-dir ../atlas [options]` from `engine/`.

| Option | Default | |
|---|---|---|
| `--port N` | `8780` with `--web` (the next 9 are tried if it is taken); `0` (a free one) otherwise | A fixed port keeps the browser's address, and what it stores for it, the same from one launch to the next. |
| `--data-dir DIR` | `$XDG_DATA_HOME/phosphene`, else `~/.local/share/phosphene` | Where the person's data lives (below). Another folder is a second, separate profile. |
| `--atlas-dir DIR` | required | The content: concept map, templates, finer kinds, looks (`atlas/`). |
| `--web` | off | Serve the page (from `--web-dir`, default the `web/` next to the atlas folder), keep the key in `DATA/web-token`, print the link, open the browser. |
| `--no-open` | | With `--web`: print the link, do not open the browser. |
| `--model ID` | `none` | A model to load at start (it must be installed). With `none` the page chooses through `/models`. |
| `--size N` | `512` | The size of a picture when a request does not say. A multiple of 8, 64 to 1024. |
| `--batch N` | `4` | How many requests are drawn together (faster per picture). |
| `--insecure-no-token` | | No key at all. Only for experiments on a machine nobody else uses. |

## Environment

| Variable | |
|---|---|
| `PHOSPHENE_TOKEN` | The key, instead of the one kept in `DATA/web-token` (so it does not show in the process list). Without `--web` it is required. |
| `PHOSPHENE_CATALOG` | Another catalogue file in place of `catalog.json` (see [EXTENDING.md](EXTENDING.md)). |
| `XDG_DATA_HOME` | Moves the default data folder. |
| `HF_HOME`, `HF_HUB_CACHE` | Where the models are kept (Hugging Face's own variables: the cache is shared with other programs). |
| `UV_HTTP_TIMEOUT` | At install time: a long one (1200) keeps the PyTorch download from failing. |

## The data folder

| | |
|---|---|
| `user.json` | The person's choices, saved pictures (references), what was learned (the observations, never fitted weights), and their history. Written by the page. |
| `saved/` | The pictures that were saved: copies of the pixels, so another model never changes them. |
| `cache/<version key>/` | Every picture drawn, by exact request. Safe to delete (it is made again); a different model or setting has its own folder. |
| `embeds/` | The prompt embeddings of each model, made at its first start (minutes for the big ones). Safe to delete. |
| `settings.json` | What was tuned per model (steps, guidance). `managed.json`: the model files this program downloaded (only these are ever deleted). `user-models.json`: models added from Hugging Face. `captioner.json`: the reader. `attrs.json`: the looks that were discovered. |
| `web-token`, `epoch` | The key (mode 600), and the identity of the folder: a page that was open before a reset cannot write its old state back. |

A fresh start: stop the engine and delete `user.json` (and `saved/`, if you want the pictures gone too).

## What can be tuned in the code

| | |
|---|---|
| `web/js/core/tuning.js` | Every number of the mosaic and the recommender (spacing, lens, how much to explore, the window of signals, the weight of a heart...). The simulators in `web/tools` show what a change does (`T='{"EXPLOIT_PULL":0.9}' node web/tools/simulate-discover.js`). |
| `engine/src/phosphene_engine/catalog.json` | The models and readers, with their steps and guidance ranges. |
| `atlas/` | The content the mosaic is made of. |

## For the page

`window.__worldSeed` (a whole number, set before the page's scripts run) makes a mosaic start the same way twice; used by tests and recordings (`web/js/app/testing.js`).
