# 8. Professional models on a 4 GB card: quantised weights in RAM, moved to the card one block at a time

**Decision.** Models too big for the graphics card (FLUX.1 schnell, 12 billion parameters) run by keeping their weights quantised in RAM and moving one block at a time to the card while a
picture is made (diffusers group offloading), with 16-bit compute. FLUX.1 schnell comes as the 4-bit GGUF file `city96/FLUX.1-schnell-gguf` (Q4_K_S, 6.8 GB, Apache 2.0, no login) plus
the text encoders, VAE and configs of the diffusers mirror `unsloth/FLUX.1-schnell` (the official repository asks for a click-through on the site). It is `engine/src/phosphene_engine/backends/flux.py`.

**Measured on an RTX 500 Ada Laptop (4 GB), 30 GB RAM.**
- One transformer step (19 double + 38 single blocks, bf16): 1.1 s at 512 px, 2.4 s at 768, 4.4 s at 1024 (random weights, real architecture); streaming 12 GB of 8-bit weights would take
  1.5 s a step (7.9 GB/s), overlapped with compute.
- FLUX.1 schnell Q4_K_S, 4 steps: 8.5 s a picture at 512 px (two at a time), 17.7 s at 768 px; 12.5 s through the engine one picture at a time. Peak use of the card: 1.3 to 1.6 GB.
- First run: the 1578 concept prompts go through CLIP-L and T5-XXL (the T5, 9.5 GB, is moved through the card one layer at a time): 4 minutes; the embeddings (65 x 4096 per prompt, 0.8 GB) are
  kept on disk and the encoders are never loaded again. The transformer is loaded after the encoders so the two are never in RAM together.
- Block-level offloading does not work for the T5 (it ran out of memory); leaf-level does (9.7 s for 8 prompts, 0.27 GB peak).

**Consequences.** About 17 GB to download and about 12 GB of RAM while it runs. A mosaic of 100 pictures takes minutes, not seconds: it suits looking at fewer, better pictures (and saving
them). No step previews for this model yet. Not offered: FLUX.1 dev (licence click-through, non-commercial), SD 3.5 (gated), Florence-2 (custom code).
