import gc

from .. import hardware
import os

import torch
from diffusers import AutoencoderKL, AutoencoderTiny, StableDiffusionXLPipeline
from huggingface_hub import try_to_load_from_cache

from .base import Backend

POOLED = 1280          # the pooled embedding of the second text encoder: carried as one extra row after the 77 token rows, so cells can mix it like the rest


class Sdxl(Backend):
    """An SDXL-family model (SDXL-Turbo, the Lightning fine-tunes...) on a 4 GB card. Two things make it fit and be quick: the text encoders are only needed to make the prompt
    embeddings (kept on disk), so they are dropped once those exist; and the UNet is held in 8-bit floats (computed in 16-bit), which halves it to about 2.6 GB.
    The decoder is the SDXL one rebuilt to work in 16-bit (madebyollin/sdxl-vae-fp16-fix), decoding one picture at a time: sharper than the tiny TAESDXL, and it fits."""
    vae = "sdxlfix"

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.min_free_vram_mb = entry["needs_vram_mb"]
        self.params_default = {p["id"]: p["default"] for p in entry["params"]}
        super().__init__()

    def load(self, device):
        self.device = device
        folder = os.path.dirname(try_to_load_from_cache(self.entry["repo"], "model_index.json"))
        self.pipe = StableDiffusionXLPipeline.from_pretrained(folder, torch_dtype=torch.float16, variant="fp16", use_safetensors=True, local_files_only=True)
        self.pipe.set_progress_bar_config(disable=True)
        self.pipe.text_encoder.to(device); self.pipe.text_encoder_2.to(device)        # to encode prompts (only needed on a first run)
        self.neg = self.negpool = None

    def ready(self):
        p = self.pipe
        with torch.no_grad():                                             # the empty prompt, for guidance above 1
            ne, _, npool, _ = p.encode_prompt(prompt=[""], device=self.device, num_images_per_prompt=1, do_classifier_free_guidance=False)
        self.neg, self.negpool = ne.half().cpu(), npool.half().cpu()
        p.text_encoder = None; p.text_encoder_2 = None
        gc.collect(); hardware.empty_cache(self.device)
        if self.device == "cuda": p.unet.enable_layerwise_casting(storage_dtype=torch.float8_e4m3fn, compute_dtype=torch.float16)
        p.unet.to(self.device)
        p.vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16, local_files_only=True).to(self.device)
        p.vae.enable_slicing(); p.vae.enable_tiling()
        self.tiny = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16, local_files_only=True).to(self.device)          # only for the previews between steps

    def unload(self):
        self.pipe = None; self.neg = self.negpool = self.tiny = None

    def max_batch(self, size):
        return 4 if size <= 512 else 2 if size <= 768 else 1

    @torch.no_grad()
    def encode_prompts(self, prompts):
        pe, _, pool, _ = self.pipe.encode_prompt(prompt=prompts, device=self.device, num_images_per_prompt=1, do_classifier_free_guidance=False)
        row = torch.zeros((pe.shape[0], 1, pe.shape[2]), dtype=pe.dtype, device=pe.device); row[:, 0, :POOLED] = pool
        return torch.cat([pe, row], dim=1).half().cpu()

    @torch.no_grad()
    def decode_latents(self, lat):
        return self.tiny.decode(lat).sample

    @torch.no_grad()
    def render(self, embeds, seeds, size, progress=None):
        n = size // 8; g = float(self.params["guidance"]); dev = self.device
        e = embeds.to(dev, torch.float16)
        lat = torch.cat([torch.randn((1, 4, n, n), generator=torch.Generator("cpu").manual_seed(s)) for s in seeds]).to(dev, torch.float16)
        kw = dict(prompt_embeds=e[:, :-1], pooled_prompt_embeds=e[:, -1, :POOLED], num_inference_steps=int(self.params["steps"]), guidance_scale=g, latents=lat, height=size, width=size, output_type="pil",
                  **self.step_callback(self.pipe, progress, int(self.params["steps"]), self.decode_latents))
        if g > 1.0:
            b = len(seeds)
            kw.update(negative_prompt_embeds=self.neg.to(dev).expand(b, -1, -1), negative_pooled_prompt_embeds=self.negpool.to(dev).expand(b, -1))
        return self.pipe(**kw).images
