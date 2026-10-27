import torch
from diffusers import AutoencoderTiny, AutoPipelineForText2Image

from .base import Backend


class SdTurbo(Backend):
    """SD-Turbo (one step) with the tiny TAESD decoder: about 10 images/s at 512 px on a 4 GB laptop GPU."""
    id = "sd-turbo"
    lazy_prompts = True          # keeps its text encoder on the card: the prompts of attributes are made when asked for (see generator.py)
    vae = "taesd"
    min_free_vram_mb = 3000
    params_default = {"steps": 1}

    def load(self, device):
        self.device = device
        self.pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sd-turbo", torch_dtype=torch.float16, variant="fp16", safety_checker=None, local_files_only=True).to(device)
        self.pipe.set_progress_bar_config(disable=True)
        self.pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesd", torch_dtype=torch.float16, local_files_only=True).to(device)

    def unload(self):
        self.pipe = None

    @torch.no_grad()
    def decode_latents(self, lat):
        return self.pipe.vae.decode(lat / self.pipe.vae.config.scaling_factor).sample

    @torch.no_grad()
    def encode_prompts(self, prompts):
        return self.pipe.encode_prompt(prompts, self.device, 1, False)[0].half().cpu()

    @torch.no_grad()
    def render(self, embeds, seeds, size, progress=None):
        n = size // 8
        lat = torch.cat([torch.randn((1, 4, n, n), generator=torch.Generator("cpu").manual_seed(s)) for s in seeds])
        return self.pipe(prompt_embeds=embeds.to(self.device, torch.float16), num_inference_steps=int(self.params["steps"]), guidance_scale=0.0,
                         latents=lat.to(self.device, torch.float16), output_type="pil",
                         **self.step_callback(self.pipe, progress, int(self.params["steps"]), self.decode_latents)).images
