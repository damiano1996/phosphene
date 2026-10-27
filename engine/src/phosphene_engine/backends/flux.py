import gc

from .. import hardware
import os

import torch
from diffusers import AutoencoderKL, FlowMatchEulerDiscreteScheduler, FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig
from diffusers.hooks import apply_group_offloading
from huggingface_hub import try_to_load_from_cache

from .base import Backend

TOKENS = 64          # T5 tokens kept per prompt: the prompts are short ("a photo of an orchid")
POOLED = 768         # CLIP's pooled embedding, carried as one extra row after the tokens (the cells mix it like the rest)


class Flux(Backend):
    """FLUX.1 schnell (a 12 billion parameter model) on a 4 GB card. The weights are the 4-bit GGUF file, kept in RAM and moved to the card one block at a time while a picture is made
    (about 1.3 to 1.6 GB of the card is in use), and compute is 16-bit. The two text encoders (CLIP-L and T5-XXL, 9.5 GB) are only needed to make the prompt embeddings, which are kept on
    disk: they are loaded only on a first run and the T5 is moved through the card one layer at a time. The transformer is loaded after them, so the two never sit in RAM together."""
    vae = "flux-vae"
    variants = 1          # its prompts take 5 to 10 minutes to prepare and are large: it draws the plain concept only

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.min_free_vram_mb = entry["needs_vram_mb"]
        self.params_default = {p["id"]: p["default"] for p in entry["params"]}
        super().__init__()

    def load(self, device):
        self.device = device
        self.folder = os.path.dirname(try_to_load_from_cache(self.entry["repo"], "model_index.json"))
        self.te1 = self.te2 = self.tok1 = self.tok2 = self.pipe = None

    def _encoders(self):
        from transformers import CLIPTextModel, CLIPTokenizer, T5EncoderModel, T5TokenizerFast
        dt = torch.bfloat16
        self.tok1 = CLIPTokenizer.from_pretrained(self.folder, subfolder="tokenizer", local_files_only=True)
        self.te1 = CLIPTextModel.from_pretrained(self.folder, subfolder="text_encoder", torch_dtype=dt, local_files_only=True).to(self.device)
        self.tok2 = T5TokenizerFast.from_pretrained(self.folder, subfolder="tokenizer_2", local_files_only=True)
        self.te2 = T5EncoderModel.from_pretrained(self.folder, subfolder="text_encoder_2", torch_dtype=dt, local_files_only=True)
        apply_group_offloading(self.te2, onload_device=torch.device(self.device), offload_device=torch.device("cpu"), offload_type="leaf_level")

    @torch.no_grad()
    def encode_prompts(self, prompts):
        if self.te2 is None: self._encoders()
        pooled = self.te1(**self.tok1(prompts, padding="max_length", max_length=77, truncation=True, return_tensors="pt").to(self.device)).pooler_output
        tokens = self.te2(self.tok2(prompts, padding="max_length", max_length=TOKENS, truncation=True, return_tensors="pt").input_ids.to(self.device))[0]
        row = torch.zeros((tokens.shape[0], 1, tokens.shape[2]), dtype=tokens.dtype, device=tokens.device); row[:, 0, :POOLED] = pooled
        return torch.cat([tokens, row], dim=1).half().cpu()

    def ready(self):
        self.te1 = self.te2 = self.tok1 = self.tok2 = None
        gc.collect(); hardware.empty_cache(self.device)
        dt = torch.bfloat16
        gguf = try_to_load_from_cache(self.entry["gguf_repo"], self.entry["gguf_file"])
        tr = FluxTransformer2DModel.from_single_file(gguf, quantization_config=GGUFQuantizationConfig(compute_dtype=dt), config=self.folder, subfolder="transformer", torch_dtype=dt)
        apply_group_offloading(tr, onload_device=torch.device(self.device), offload_device=torch.device("cpu"), offload_type="block_level", num_blocks_per_group=1, use_stream=True)
        vae = AutoencoderKL.from_pretrained(self.folder, subfolder="vae", torch_dtype=dt, local_files_only=True).to(self.device); vae.enable_tiling()
        sched = FlowMatchEulerDiscreteScheduler.from_pretrained(self.folder, subfolder="scheduler", local_files_only=True)
        self.pipe = FluxPipeline(scheduler=sched, vae=vae, text_encoder=None, tokenizer=None, text_encoder_2=None, tokenizer_2=None, transformer=tr)
        self.pipe.set_progress_bar_config(disable=True)

    def unload(self):
        self.pipe = None; self.te1 = self.te2 = None

    def max_batch(self, size):
        return 2 if size <= 512 else 1

    @torch.no_grad()
    def render(self, embeds, seeds, size, progress=None):
        e = embeds.to(self.device, torch.bfloat16)
        gens = [torch.Generator("cpu").manual_seed(s) for s in seeds]
        return self.pipe(prompt_embeds=e[:, :TOKENS], pooled_prompt_embeds=e[:, TOKENS, :POOLED], height=size, width=size, num_inference_steps=int(self.params["steps"]),
                         guidance_scale=0.0, generator=gens, max_sequence_length=TOKENS, output_type="pil").images
