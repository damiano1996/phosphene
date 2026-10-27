"""The model manager: which image model the engine has loaded (and what happens when a switch fails), and the one place that ties together the catalogue, the downloads and the reader of
pictures.

Modelled on InvokeAI's Model Manager (a catalogue of starter models, an install queue with a progress bar, delete removes only what the manager itself downloaded). The parts:
catalog.py (what exists and what is installed), downloads.py (install and delete), readers.py (the optional reader of pictures), generator.py (a loaded model)."""
import gc
import os
import threading

import torch

from . import hardware
from .atlas import Atlas
from .attrs import Attrs
from .backends import create
from .catalog import Catalog, friendly
from .downloads import Downloads
from .generator import Generator
from .hardware import MB
from .readers import Readers


class Manager:
    def __init__(self, atlas: Atlas, data_dir: str, device: str):
        self.atlas, self.data_dir, self.device = atlas, data_dir, device
        self.catalog = Catalog(data_dir)
        self.downloads = Downloads(self.catalog)
        self.attrs = Attrs(atlas.directory, data_dir)
        self.readers = Readers(self.catalog, atlas.directory, data_dir, self.attrs, device, self.downloads.jobs)
        self.gen = None
        self.gen_lock = threading.RLock()            # held while a batch renders, and while a model is swapped
        self.activation = {"model": None, "phase": "idle", "message": ""}

    # ---- what the HTTP layer reads --------------------------------------------------------------------
    cap = property(lambda self: self.readers.cap)
    cap_state = property(lambda self: self.readers.state)

    def entry(self, model_id): return self.catalog.entry(model_id)
    def describe(self, jpg): return self.readers.describe(jpg)
    def look_words(self): return self.readers.look_words()
    def cache_dir(self, gen): return os.path.join(self.data_dir, "cache", gen.key.replace(".", "_"))

    def listing(self):
        hw = hardware.detect(); cat = self.catalog
        out, recommended = [], None
        for m in cat.images():
            fit = hardware.fit(hw, m["needs_vram_mb"]) if m["available"] else "unavailable"
            if recommended is None and fit in ("ok", "busy"): recommended = m["id"]
            out.append({"user": bool(m.get("user")), "params": m.get("params", []), "values": cat.values(m), "id": m["id"], "name": m["name"], "tagline": m["tagline"], "available": m["available"], "needs_vram_mb": m["needs_vram_mb"],
                        "size_mb": m.get("size_mb", 0), "min_size": m.get("min_size", 256), "needs_ram_mb": m.get("needs_ram_mb", 0), "speed": m.get("speed", ""), "licence": m.get("licence", ""), "page": m.get("page", ""), "fit": fit, "installed": cat.installed(m),
                        "deletable": cat.owned(m), "active": self.gen is not None and self.gen.backend.id == m["id"], "job": self.downloads.jobs.get(m["id"])})
        return {"hardware": hw, "recommended": recommended, "models": out, "activation": self.activation, "data_dir": self.data_dir, "ram_free_mb": hardware.ram_free_mb(),
                "captioners": self.readers.listing(hw), "captioner": self.readers.summary()}

    # ---- models: install, add, delete, tune ----------------------------------------------------------
    def install(self, model_id): self.downloads.install(model_id)
    def add_user_model(self, link): return self.catalog.add_user_model(link)

    def delete(self, model_id):
        def in_use(mid):
            if self.gen is not None and self.gen.backend.id == mid: raise ValueError("this model is in use: switch to another one first")
            if self.readers.cfg.get("id") == mid: raise ValueError("this reader is in use: turn it off first")
        return self.downloads.delete(model_id, in_use)

    def set_params(self, model_id, values, reset=False):
        """Change what the user may tune for a model (steps, guidance...). Values are checked against the catalogue's ranges. If the model is loaded the change applies at once and
        changes its version key, so images made with another setting are never mixed in."""
        mine = self.catalog.set_tuned(model_id, values, reset)
        with self.gen_lock:
            if self.gen is not None and self.gen.backend.id == model_id:
                self.gen.backend.params = {**self.gen.backend.params_default, **mine}
                os.makedirs(self.cache_dir(self.gen), exist_ok=True)

    # ---- the reader of pictures -----------------------------------------------------------------------
    def activate_captioner(self, cid, device="auto"): self.readers.activate(cid, device)
    def deactivate_captioner(self): self.readers.deactivate()

    def add_attr(self, label, phrase, group="discovered"):
        i = self.attrs.add(label, phrase, group)
        self.readers.attribute_added()
        return i

    # ---- use ------------------------------------------------------------------------------------------
    def activate(self, model_id):
        m = self.entry(model_id)
        if not self.catalog.installed(m): raise ValueError("install this model first")
        if self.activation["phase"] in ("loading", "encoding"): raise ValueError("a model is already being loaded")
        self.activation = {"model": model_id, "phase": "loading", "message": "Loading " + m["name"]}
        threading.Thread(target=self._activate, args=(model_id,), daemon=True).start()

    def _activate(self, model_id):
        """Brings a model into use. If that fails the one that was in use is loaded again, so a failed switch never leaves the page with nothing: it ends 'ready' on the old model
        and says (activation["failed"]) what went wrong with the new one."""
        prev = getattr(self, "active_id", None)
        self.readers.suspend()
        try:
            self._load(model_id)
            self.active_id = model_id
            self.activation = {"model": model_id, "phase": "ready", "message": ""}
        except Exception as e:
            failed = {"model": model_id, "message": friendly(e)}
            self.active_id = None
            if prev and prev != model_id:
                self.activation = {"model": prev, "phase": "loading", "message": "Could not use that model; going back to " + self.entry(prev)["name"]}
                try:
                    self._load(prev); self.active_id = prev
                    self.activation = {"model": prev, "phase": "ready", "message": "", "failed": failed}
                except Exception:
                    self.activation = {"model": model_id, "phase": "error", "message": failed["message"]}
            else:
                self.activation = {"model": model_id, "phase": "error", "message": failed["message"]}
        self.readers.resume()

    def _load(self, model_id):
        backend = None
        try:
            with self.gen_lock:                      # waits for a running batch; renders see no model until the new one is ready
                old, self.gen = self.gen, None
                if old is not None: old.backend.unload()
                del old; gc.collect()
                hardware.empty_cache(self.device)
            backend = create(self.entry(model_id))
            backend.params = {**backend.params_default, **self.catalog.tuned(model_id)}
            free = (torch.cuda.mem_get_info()[0] // MB) if self.device == "cuda" else 0
            if self.device == "cuda" and free < backend.min_free_vram_mb:
                raise RuntimeError(f"not enough free GPU memory: {backend.min_free_vram_mb} MB needed, {free} MB free (close other programs that use the GPU)")

            def phase(name):
                self.activation = {"model": model_id, "phase": name, "message": self.entry(model_id).get("encode_note", "Preparing the concept prompts (first time only, about a minute)") if name == "encoding" else "Loading " + self.entry(model_id)["name"]}
            gen = Generator(backend, self.atlas, os.path.join(self.data_dir, "embeds"), self.device, phase, self.attrs)
            os.makedirs(self.cache_dir(gen), exist_ok=True)
            self.gen = gen
        except Exception:
            self.gen = None
            if backend is not None: backend.unload()          # a half-loaded model must not keep the GPU memory
            backend = None
            gc.collect(); hardware.empty_cache(self.device)
            raise
