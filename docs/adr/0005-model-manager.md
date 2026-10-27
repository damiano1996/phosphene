# 0005: Model manager (catalogue, install, delete, switch)

Status: accepted. Modelled on InvokeAI's Model Manager (starter catalogue, install queue with a progress bar, delete removes only what the manager itself downloaded).

- The engine starts with **no model** (`--model none`, the default) and prints `ready` with `"key": null`. The app then asks `GET /models` (hardware, catalogue, installed / fits / downloading) and drives `POST /models/install|activate|delete?id=`. All of these need the token.
- `engine/src/phosphene_engine/catalog.json` lists each model as explicit files per Hugging Face repo (no globs, so "installed" is an exact check with `try_to_load_from_cache`). Entries without a backend (`available: false`) are shown as "Not available yet", never selectable.
- Weights live in the shared Hugging Face cache. A file that was there before an install is never deleted; files the manager downloaded are recorded in `managed.json`, and a file another installed model still needs (the TAESD decoder) is kept.
- Backends load with `local_files_only=True`: nothing downloads behind the manager's back.
- Tiers use the card's **total** memory (what it can run); free memory is a separate "close other programs" warning. Hardware is read with `nvidia-smi` so that looking does not create a CUDA context.
- Switching: the render loop and the swap share `gen_lock`; the old model is unloaded and the GPU cache emptied before the new one loads; the cache directory is per key; `/img` answers 503 while no model is loaded and 409 for a key that is not the current one; the app clears its image store when the key changes.
- Progress comes from huggingface_hub's own tqdm byte bar (`tqdm_class`); with hf_xet the files do not grow on disk until the end, so polling the folder shows nothing.
- Not done: cancel, resume UI, gated models (Hugging Face token), URL / local-folder install, SDXL-Turbo and FLUX backends.

## Addendum: user-tunable settings and models added from Hugging Face

- Each catalogue entry may declare `params` (steps, guidance, with ranges). `POST /models/params?id=&steps=&guidance=` validates them, stores them in `settings.json` and, if the model is loaded, applies them at once; any value that differs from the default goes into the version key (`…taesd-guidance1p5-steps6`), so settings never share cached images.
- `POST /models/add?repo=<link or owner/name>` inspects a Hugging Face repository (no download of weights) and adds it to `user-models.json` only if it is a `StableDiffusionPipeline` in diffusers format with **safetensors** weights; gated repositories, other pipelines (SDXL, FLUX...), single-file checkpoints and pickled weights are refused with the reason. Such models use the generic backend (`backends/generic.py`), loaded from the downloaded folder, never with remote code.
- Categories: hidden categories are applied with `Atlas.without(...)` when the mosaic is built (the engine's atlas and version are unchanged); favourites steer the start and the world as before.
