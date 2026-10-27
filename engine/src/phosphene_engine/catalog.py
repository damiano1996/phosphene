"""The catalogue: which models exist (catalog.json, plus the ones the person added from Hugging Face), which are installed, what the person tuned, and what this program downloaded itself.

Weights live in the Hugging Face cache, which other programs share: a file that was already there before an install is "installed from your cache" and is never deleted here
(`managed` is the list of what we downloaded, "repo::file")."""
import os

from huggingface_hub import try_to_load_from_cache

from .hardware import MB
from .util import read_json, write_json


def cached(repo, filename):
    p = try_to_load_from_cache(repo, filename)
    return p if isinstance(p, str) and os.path.exists(p) else None


def friendly(e):
    s = str(e)
    if "401" in s or "403" in s or "gated" in s.lower(): return "This model needs a Hugging Face account that has accepted its licence (not supported yet)."
    if "Connection" in s or "Max retries" in s or "timed out" in s.lower(): return "Could not reach Hugging Face: check the internet connection and try again."
    return s[:300]


def repo_id(link):
    """"owner/name" from a Hugging Face link ("https://huggingface.co/owner/name/tree/main") or from the id itself."""
    s = link.strip()
    for pre in ("https://huggingface.co/", "http://huggingface.co/", "huggingface.co/", "https://hf.co/", "hf.co/"):
        if s.startswith(pre): s = s[len(pre):]; break
    parts = [p for p in s.split("?")[0].split("/") if p]
    if len(parts) < 2 or any(c in "".join(parts[:2]) for c in " \\:*<>|"): raise ValueError("Paste a Hugging Face link or an id like owner/name.")
    return "/".join(parts[:2])


class Catalog:
    def __init__(self, data_dir: str, path: str = None):
        os.makedirs(data_dir, exist_ok=True)
        # PHOSPHENE_CATALOG points at another catalogue file (to add or change models without touching the code: see docs/EXTENDING.md)
        self.models = read_json(path or os.environ.get("PHOSPHENE_CATALOG") or os.path.join(os.path.dirname(__file__), "catalog.json"))["models"]
        self._user_file = os.path.join(data_dir, "user-models.json")           # models the person added from Hugging Face
        self.models += read_json(self._user_file) if os.path.exists(self._user_file) else []
        self._marker = os.path.join(data_dir, "managed.json")
        self.managed = set(read_json(self._marker)) if os.path.exists(self._marker) else set()    # "repo::file" this program downloaded itself
        self._settings_file = os.path.join(data_dir, "settings.json")      # what the person tuned, per model: {"sd15-lcm": {"steps": 6}}
        self.settings = read_json(self._settings_file) if os.path.exists(self._settings_file) else {}

    # ---- what there is
    def entry(self, model_id):
        for m in self.models:
            if m["id"] == model_id: return m
        raise KeyError(model_id)

    def installed(self, m):
        return bool(m["parts"]) and all(cached(p["repo"], f) for p in m["parts"] for f in p["files"])

    def owned(self, m):
        """Installed, and every file of it is one this program downloaded (so deleting it is ours to do)."""
        return self.installed(m) and all(f"{p['repo']}::{f}" in self.managed for p in m["parts"] for f in p["files"])

    def images(self):
        """The image models."""
        return [m for m in self.models if m.get("kind") != "captioner"]

    def readers(self):
        """The readers of pictures."""
        return [m for m in self.models if m.get("kind") == "captioner"]

    # ---- what the person tuned
    def tuned(self, model_id): return self.settings.get(model_id, {})

    def values(self, m):
        return {p["id"]: self.tuned(m["id"]).get(p["id"], p["default"]) for p in m.get("params", [])}

    def set_tuned(self, model_id, values, reset=False):
        """Checks the values against the catalogue's ranges and keeps them (only what differs from the defaults). Returns the settings of the model."""
        m = self.entry(model_id); schema = {p["id"]: p for p in m.get("params", [])}
        mine = {} if reset else dict(self.tuned(model_id))
        for k, v in values.items():
            if k not in schema: raise ValueError(f"unknown setting '{k}'")
            p = schema[k]; x = float(v)
            if not (p["min"] <= x <= p["max"]): raise ValueError(f"{p['label']} must be between {p['min']} and {p['max']}")
            x = round(x / p["step"]) * p["step"]
            mine[k] = int(x) if isinstance(p["default"], int) else round(x, 2)
        mine = {k: v for k, v in mine.items() if v != schema[k]["default"]}
        self.settings[model_id] = mine; write_json(self._settings_file, self.settings)
        return mine

    # ---- what we downloaded
    def mark_downloaded(self, keys):
        self.managed.update(keys); self.save_marker()

    def save_marker(self): write_json(self._marker, sorted(self.managed))

    # ---- models added from Hugging Face
    def forget_user_model(self, model_id):
        self.models = [m for m in self.models if m["id"] != model_id]; self.settings.pop(model_id, None); self._save_user_models()

    def _save_user_models(self):
        write_json(self._user_file, [m for m in self.models if m.get("user")], indent=1)

    def add_user_model(self, link):
        """Look at a Hugging Face repository (a link or "owner/name") and, if it is a Stable Diffusion 1.x / 2.x model in diffusers format with safetensors weights,
        add it to the catalogue (not downloaded yet). Anything else is refused with the reason."""
        from huggingface_hub import HfApi, hf_hub_download
        repo = repo_id(link)
        try:
            info = HfApi().model_info(repo, files_metadata=True)
        except Exception as e:
            if "404" in str(e) or "not found" in str(e).lower(): raise ValueError(f"'{repo}' was not found on Hugging Face") from e
            raise ValueError(friendly(e)) from e
        if info.gated: raise ValueError("This model is gated: it needs a Hugging Face account that has accepted its licence (not supported yet).")
        size = {s.rfilename: s.size or 0 for s in info.siblings}
        if "model_index.json" not in size:
            raise ValueError("This is not a diffusers model folder (no model_index.json). Single-file checkpoints are not supported yet.")
        idx = read_json(hf_hub_download(repo, "model_index.json"))
        kind = idx.get("_class_name", "?")
        if kind != "StableDiffusionPipeline":
            raise ValueError(f"This is a {kind}. Only Stable Diffusion 1.x / 2.x models (StableDiffusionPipeline) are supported so far.")
        weights = {"text_encoder": "model", "unet": "diffusion_pytorch_model", "vae": "diffusion_pytorch_model"}
        fp16 = all(f"{c}/{n}.fp16.safetensors" in size for c, n in weights.items())
        plain = all(f"{c}/{n}.safetensors" in size for c, n in weights.items())
        if not (fp16 or plain): raise ValueError("This repository has no safetensors weights for the text encoder, unet and decoder (only safetensors files are accepted, never pickled ones).")
        chosen = [f"{c}/{n}.{'fp16.' if fp16 else ''}safetensors" for c, n in weights.items()]
        small = [f for f in ("scheduler/scheduler_config.json", "text_encoder/config.json", "unet/config.json", "vae/config.json", "tokenizer/merges.txt", "tokenizer/vocab.json",
                             "tokenizer/special_tokens_map.json", "tokenizer/tokenizer_config.json", "feature_extractor/preprocessor_config.json") if f in size]
        for need in ("scheduler/scheduler_config.json", "unet/config.json", "tokenizer/vocab.json"):
            if need not in small: raise ValueError(f"The repository is incomplete (no {need}).")
        total = sum(size[f] for f in chosen + small) + size.get("model_index.json", 0)
        fp16_bytes = sum(size[f] for f in chosen) / (1 if fp16 else 2)
        name = repo.split("/")[-1]; low = name.lower()
        steps, guidance = (1, 0.0) if ("turbo" in low or "sdxs" in low) else (4, 1.0) if ("lcm" in low or "lightning" in low) else (20, 7.0)
        mid = "user--" + repo.replace("/", "--")
        entry = {"id": mid, "name": name, "backend": "sd-generic", "available": True, "user": True, "repo": repo, "variant": "fp16" if fp16 else None,
                 "tagline": f"From Hugging Face: {repo}", "needs_vram_mb": int(fp16_bytes * 1.3 / MB) + 600, "size_mb": int(total / MB) + 1,
                 "licence": (info.card_data.license if info.card_data and info.card_data.license else "see the model page"), "page": f"https://huggingface.co/{repo}",
                 "params": [{"id": "steps", "label": "Steps", "min": 1, "max": 50, "default": steps, "step": 1, "help": "Distilled models (turbo, LCM, lightning) want 1 to 8; ordinary ones 20 or more."},
                            {"id": "guidance", "label": "Guidance", "min": 0.0, "max": 12.0, "default": guidance, "step": 0.5, "help": "How closely the picture follows the prompt. About 1 or less for distilled models, 5 to 8 for ordinary ones."}],
                 "parts": [{"repo": repo, "files": ["model_index.json"] + small + chosen}]}
        if any(m["id"] == mid for m in self.models): raise ValueError("This model is already in the list.")
        self.models.append(entry)
        self._save_user_models()
        return mid

