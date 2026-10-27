import gc

from .. import hardware
import os

import torch
from diffusers import SanaSprintPipeline
from diffusers.hooks import apply_group_offloading
from huggingface_hub import try_to_load_from_cache

from .base import Backend

TOKENS = 64          # Gemma tokens kept per prompt: the prompts are short ("a photo of an orchid")


class Sana(Backend):
    """SANA Sprint 1.6B: a 1.6 billion parameter model made for one or two steps, between the small models and FLUX. The transformer is held in 8-bit floats on the card (computed in 16-bit),
    about 2.3 GB with the decoder. Its text encoder (Gemma 2B, 5 GB) is only needed to make the prompt embeddings, which are kept on disk: it is loaded only on a first run and moved through
    the card one layer at a time. Each embedding carries its attention mask as one extra row after the tokens, so cells can mix it like the rest."""
    vae = "dc-ae"
    variants = 1          # its prompt embeddings are large: it draws the plain concept only for now

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.min_free_vram_mb = entry["needs_vram_mb"]
        self.params_default = {p["id"]: p["default"] for p in entry["params"]}
        super().__init__()

    def load(self, device):
        self.device = device
        folder = os.path.dirname(try_to_load_from_cache(self.entry["repo"], "model_index.json"))
        self.pipe = SanaSprintPipeline.from_pretrained(folder, text_encoder=None, torch_dtype=torch.bfloat16, local_files_only=True)
        self.pipe.set_progress_bar_config(disable=True)
        self.folder, self.te, self.placed = folder, None, False

    def _encoder(self):
        from transformers import AutoModel
        self.te = AutoModel.from_pretrained(self.folder, subfolder="text_encoder", torch_dtype=torch.bfloat16, local_files_only=True)
        apply_group_offloading(self.te, onload_device=torch.device(self.device), offload_device=torch.device("cpu"), offload_type="leaf_level")
        self.pipe.text_encoder = self.te

    @torch.no_grad()
    def encode_prompts(self, prompts):
        if self.te is None: self._encoder()
        emb, mask = self.pipe.encode_prompt(prompts, device=self.device, max_sequence_length=TOKENS, complex_human_instruction=None)
        row = torch.zeros((emb.shape[0], 1, emb.shape[2]), dtype=emb.dtype, device=emb.device); row[:, 0, :TOKENS] = mask.to(emb.dtype)
        return torch.cat([emb, row], dim=1).half().cpu()

    def ready(self):
        self.te = None; self.pipe.text_encoder = None
        gc.collect(); hardware.empty_cache(self.device)
        p = self.pipe
        if self.device == "cuda": p.transformer.enable_layerwise_casting(storage_dtype=torch.float8_e4m3fn, compute_dtype=torch.bfloat16)
        p.transformer.to(self.device); p.vae.to(self.device, torch.bfloat16); p.vae.enable_tiling(tile_sample_min_height=512, tile_sample_min_width=512)

    def unload(self):
        self.pipe = None; self.te = None

    def max_batch(self, size):
        return 2 if size <= 512 else 1          # the decoder needs room for every picture of a batch at once

    @torch.no_grad()
    def decode_latents(self, lat):
        v = self.pipe.vae
        return v.decode(lat.to(v.dtype) / self.pipe.scheduler.config.sigma_data / v.config.scaling_factor, return_dict=False)[0]

    @torch.no_grad()
    def render(self, embeds, seeds, size, progress=None):
        e = embeds.to(self.device, torch.bfloat16)
        gens = [torch.Generator("cpu").manual_seed(s) for s in seeds]
        steps = int(self.params["steps"])
        return self.pipe(prompt=None, prompt_embeds=e[:, :TOKENS], prompt_attention_mask=(e[:, TOKENS, :TOKENS] > 0.25).long(), height=size, width=size, num_inference_steps=steps,
                         intermediate_timesteps=1.3 if steps == 2 else None, use_resolution_binning=False, generator=gens, max_sequence_length=TOKENS, output_type="pil",
                         **self.step_callback(self.pipe, progress, steps, self.decode_latents)).images
