# Extending Phosphene

Four things are meant to be extended, from the easiest: a **model**, a **reader** of pictures, the **content** the mosaic is made of, and a **backend** (a new kind of image model).

## Add a model

A model is an entry of `engine/src/phosphene_engine/catalog.json` (or of a file of your own: `PHOSPHENE_CATALOG=/path/to/catalog.json`, which replaces it). If its architecture is one the engine
already draws, nothing else is needed. The fields:

| Field | |
|---|---|
| `id`, `name`, `tagline` | The id is used in URLs, caches and settings: lowercase, stable. The tagline is what the model card says. |
| `backend` | Which class draws it: `sdturbo`, `lcm`, `sd-generic` (any Stable Diffusion 1.x/2.x folder), `sdxl`, `flux`, `sana` (or a backend you registered). |
| `available` | `false` shows the card as "not available yet". |
| `needs_vram_mb`, `needs_ram_mb`, `min_size`, `size_mb` | What it needs on the card and in memory, the smallest picture it draws well, the download. The page uses them to say whether it fits here. |
| `licence`, `page`, `speed` | Shown to the person before they choose it. Be accurate: it is what they rely on. |
| `repo`, `parts` | Where the files are. `parts` lists **every file** to download, per Hugging Face repository (no patterns): "installed" is an exact check, and only what this program downloaded is ever deleted. |
| `params` | What the person may tune (`steps`, `guidance`...): `id`, `label`, `min`, `max`, `default`, `step`, `help`. A value that differs from the default becomes part of the version key. |

A person can also add a Stable Diffusion 1.x/2.x model from a Hugging Face link in the app (Settings, Model): it is checked, then written to `user-models.json` in their data folder.

## Add a reader of pictures

Same file, with `"kind": "captioner"` and `"mode"`: `"tags"` (a CLIP model; the picture is compared with the words of `atlas/vocab.json`, the engine's attributes and the lexicon) or `"caption"` (a small
vision-language model writes a sentence). See `clip-tags` and `smolvlm-256m`. A new *mode* is a branch in `captioner.py`.

## Add content

The page and the engine read the same files in `atlas/`; they are the content of the mosaic, not code.

| File | What | Rebuild |
|---|---|---|
| `concepts.py` → `atlas.tsv`, `templates.json` | The 526 concepts in 43 categories, and the prompt templates. | `atlas/build_atlas.py` (needs `uv sync --extra atlas`). **A new concept map changes `atlas.tsv`'s version: what people had learned is set aside**, so append, do not reorder. |
| `build_facets.py` → `facets.json` | The attributes (looks), the finer kinds of some concepts (a phrase and the looks it carries), the generic kinds for the rest. | `python3 atlas/build_facets.py`. Changing the kinds changes the prompts of every model: their embeddings are made again, once. |
| `lexicon.json` | Looks the app may discover (a label and the words of its prompt). | edit; the engine reads it at start. |
| `vocab.json` | The words the reader scores every picture on. | edit. |

## Add a backend (a new kind of image model)

1. Write a subclass of `Backend` (`engine/src/phosphene_engine/backends/base.py`). It must accept prompt **embeddings**, not text: a cell can blend two concepts. You implement:
   `load(device)`, `encode_prompts(prompts)` (a CPU half tensor, `(n, tokens, dim)`), `render(embeds, seeds, size, progress=None)` (a list of PIL images), and optionally `ready()`,
   `unload()`, `max_batch(size)`, and `self.step_callback(...)` in `render` to stream previews. Set `id`, `vae` (both go into the version key), `min_free_vram_mb` and `params_default`.
   A backend that keeps its text encoder on the card can set `lazy_prompts = True`: the prompts of "looks" are then made when asked for (see `generator.py`); `variants = 1` limits it to the plain concept.
2. Register it by name: `backends.register("my-kind", "my_package.module:MyClass")` (relative targets work too: `".mine:Mine"`). The class gets the catalogue entry as its only argument,
   or none if its constructor takes none. It is imported only when a model that names it is loaded.
3. Add a catalogue entry with `"backend": "my-kind"`.
4. Test the part that needs no GPU the way `engine/tests/test_backends.py` does.

If a model is too slow to prepare its prompts or its embeddings are too large (FLUX: 5–10 minutes the first time), keep `variants = 1`.

## Add an endpoint

`engine/src/phosphene_engine/api.py`: write a method that takes a `Request` and returns a `Reply`, and add it to `Api.routes` with its method, path and whether it needs the key. The security
checks run before every route; the API tests (`engine/tests/test_api.py`) need no server and no PyTorch.
