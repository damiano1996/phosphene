from abc import ABC, abstractmethod


class Backend(ABC):
    id: str            # goes into the cache key and the version check: switching model must never serve another model's images
    vae: str           # likewise: the decoder changes the pixels
    min_free_vram_mb: int
    params_default: dict = {}          # what the user may tune (steps, guidance...); anything here that is changed also changes the pixels, so it is part of the cache key

    def __init__(self):
        self.params = dict(self.params_default)

    def param_key(self) -> str:
        """"" for the defaults, otherwise e.g. "-steps6-guidance1p5": goes into the version key, so another setting never serves the cached images of this one."""
        diff = [f"{k}{str(v).replace('.', 'p')}" for k, v in sorted(self.params.items()) if v != self.params_default.get(k)]
        return "-" + "-".join(diff) if diff else ""

    @abstractmethod
    def load(self, device: str) -> None: ...

    def ready(self) -> None:
        """Called once the prompt embeddings exist (read from disk or just made): a backend that needed the text encoders only for that can let them go here."""

    def max_batch(self, size: int) -> int:
        """How many pictures of this side can be drawn at once without running out of graphics memory."""
        return 8

    def unload(self) -> None:
        """Drop the weights; the caller then empties the GPU cache."""

    @abstractmethod
    def encode_prompts(self, prompts: list):
        """-> tensor (n, tokens, dim), on the CPU, half precision."""

    @abstractmethod
    def render(self, embeds, seeds: list, size: int, progress=None) -> list:
        """embeds: tensor (n, tokens, dim); one noise seed per item -> list of PIL images.
        progress(step, total, decode), if given, is called after every step of a multi-step render; decode(indices, noise=False) turns the current state of those items
        into small preview pictures (cheaply: a person looking at one of them can then see it take shape): the estimate of the finished picture, or with noise=True the
        latents themselves, which are static until the last steps."""

    def step_callback(self, pipe, progress, total, decode_latents):
        """The kwargs for a diffusers pipeline call that report each step to `progress` (nothing for a one-step model: there is nothing to show before the end).
        What is shown is the scheduler's estimate of the finished picture after that step, not the half-noisy latents: those are pure static until the last steps."""
        if progress is None or total <= 1: return {}
        sched = pipe.scheduler
        if not getattr(sched, "_phosphene_wrapped", False):          # pipelines ask the scheduler for the next latents only; its estimate of the final picture is in the full output
            orig = sched.step

            def step(model_output, timestep, sample, *a, **k):
                want_tuple = not k.get("return_dict", True)
                k["return_dict"] = True
                out = orig(model_output, timestep, sample, *a, **k)
                sched._x0 = getattr(out, "pred_original_sample", None)
                if sched._x0 is None: sched._x0 = getattr(out, "denoised", None)
                return out.to_tuple() if want_tuple else out
            sched.step = step; sched._phosphene_wrapped = True

        def cb(pipe, i, t, kw):
            raw = kw["latents"]; est = getattr(pipe.scheduler, "_x0", None)
            if est is None: est = raw
            progress(i + 1, total, lambda idx, noise=False: self.to_pil(decode_latents((raw if noise else est)[idx].to(raw.dtype))))          # the estimate may be 32-bit while the decoder is 16-bit
            return kw
        return {"callback_on_step_end": cb, "callback_on_step_end_tensor_inputs": ["latents"]}

    @staticmethod
    def to_pil(x):
        """A decoder's output in -1..1, (n, 3, h, w) -> PIL images."""
        from PIL import Image
        a = ((x.float().clamp(-1, 1) + 1) / 2 * 255).byte().permute(0, 2, 3, 1).cpu().numpy()
        return [Image.fromarray(i) for i in a]
