import os

import torch
from diffusers import StableDiffusionPipeline
from huggingface_hub import try_to_load_from_cache

from .base import Backend


class SdGeneric(Backend):
    """Any Stable Diffusion 1.x / 2.x model in diffusers format that the person added from Hugging Face (safetensors only, read from the files the model manager
    downloaded, with its own decoder). Steps and guidance are the person's to set: distilled models (turbo, LCM, lightning) want few steps and little guidance."""
    vae = "own"

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.min_free_vram_mb = entry["needs_vram_mb"]
        self.params_default = {p["id"]: p["default"] for p in entry["params"]}
        super().__init__()

    def load(self, device):
        self.device = device
        e = self.entry
        # from the folder the manager filled, not by repo id: that way the loader never looks for (or complains about) other files the repository happens to hold
        folder = os.path.dirname(try_to_load_from_cache(e["repo"], "model_index.json"))
        self.pipe = StableDiffusionPipeline.from_pretrained(folder, torch_dtype=torch.float16, variant=e.get("variant"), use_safetensors=True,
                                                            safety_checker=None, requires_safety_checker=False, local_files_only=True).to(device)
        self.pipe.set_progress_bar_config(disable=True)
        self.pipe.vae.enable_slicing()
        with torch.no_grad():
            self.neg = self.pipe.encode_prompt([""], device, 1, False)[0].half()      # the empty prompt, for guidance above 1

    def unload(self):
        self.pipe = None; self.neg = None

    @torch.no_grad()
    def decode_latents(self, lat):
        return self.pipe.vae.decode(lat / self.pipe.vae.config.scaling_factor).sample

    @torch.no_grad()
    def encode_prompts(self, prompts):
        return self.pipe.encode_prompt(prompts, self.device, 1, False)[0].half().cpu()

    @torch.no_grad()
    def render(self, embeds, seeds, size, progress=None):
        n = size // 8; g = float(self.params["guidance"])
        lat = torch.cat([torch.randn((1, 4, n, n), generator=torch.Generator("cpu").manual_seed(s)) for s in seeds])
        kw = {"negative_prompt_embeds": self.neg.expand(len(seeds), -1, -1)} if g > 1.0 else {}
        return self.pipe(prompt_embeds=embeds.to(self.device, torch.float16), num_inference_steps=int(self.params["steps"]), guidance_scale=g,
                         latents=lat.to(self.device, torch.float16), output_type="pil", **kw,
                         **self.step_callback(self.pipe, progress, int(self.params["steps"]), self.decode_latents)).images
