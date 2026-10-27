# Third-party material

## Shipped with the page (`web/vendor/`)

| | Licence | |
|---|---|---|
| [Preact](https://preactjs.com) 10 with hooks, and [htm](https://github.com/developit/htm) 3.1.1, in one file (`preact-htm.js`) | Preact: MIT. htm: Apache-2.0 | Copied unchanged from `unpkg.com/htm@3.1.1/preact/standalone.module.js`; its SHA-256 is in `web/vendor/README.md`. Both licences are in `web/vendor/` (`LICENSE-preact.txt`, `LICENSE-htm.txt`). |

## Used by the engine (installed by `uv sync`, not copied here)

PyTorch, Diffusers, Transformers, Accelerate, PEFT, NumPy, Pillow, safetensors, huggingface_hub (and, to rebuild the concept map only, open_clip and scikit-learn): each under its own licence
(BSD, Apache 2.0, MIT or similar). Run `uv pip list` for what is installed.

## Models

Models are **not** part of this repository and are never redistributed by it. They are downloaded from their original source when a person asks, and keep their own licences, shown on each model's
card in the app and in `engine/src/phosphene_engine/catalog.json` (Stability AI licences, CreativeML OpenRAIL-M, OpenRAIL++, Apache 2.0, MIT). Some restrict commercial use or use cases: read them.
The pictures a model draws are subject to its terms.

## Content

The concept map, prompts, finer kinds and looks in `atlas/` are written for this project (Apache-2.0 like the code). The concept map's coordinates were computed with the CLIP model
`laion/CLIP-ViT-B-32-laion2B-s34B-b79K` (MIT).
