import torch
from diffusers import AutoencoderTiny, LCMScheduler, StableDiffusionPipeline

from .base import Backend


class Lcm(Backend):
    """Stable Diffusion 1.5 with the LCM-LoRA (four steps) and the tiny TAESD decoder. Everything is read from files the model manager installed."""
    id = "sd15-lcm"
    lazy_prompts = True          # its text encoder stays on the card (see generator.py)
    vae = "taesd"
    min_free_vram_mb = 3000
    params_default = {"steps": 4, "guidance": 1.0}

    def load(self, device):
        self.device = device
        self.pipe = StableDiffusionPipeline.from_pretrained("stable-diffusion-v1-5/stable-diffusion-v1-5", torch_dtype=torch.float16, variant="fp16",
                                                            safety_checker=None, requires_safety_checker=False, local_files_only=True).to(device)
        self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
        self.pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5", weight_name="pytorch_lora_weights.safetensors", local_files_only=True)
        self.pipe.fuse_lora()
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
        return self.pipe(prompt_embeds=embeds.to(self.device, torch.float16), num_inference_steps=int(self.params["steps"]), guidance_scale=float(self.params["guidance"]),
                         latents=lat.to(self.device, torch.float16), output_type="pil",
                         **self.step_callback(self.pipe, progress, int(self.params["steps"]), self.decode_latents)).images
