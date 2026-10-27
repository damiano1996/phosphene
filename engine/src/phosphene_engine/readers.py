"""The optional reader of pictures (a CLIP tagger or a small vision-language model): which one, where it runs (graphics card or processor), what it is doing, and the words it compares
a picture with (the engine's attributes first, then a lexicon of looks that could become one: see attrs.py and atlas/lexicon.json)."""
import gc
import os
import threading


from . import hardware
from .attrs import Attrs
from .captioner import create_reader, load_vocab
from .catalog import Catalog, friendly
from .util import read_json, write_json


class Readers:
    def __init__(self, catalog: Catalog, atlas_dir: str, data_dir: str, attrs: Attrs, device: str, jobs):
        self.catalog, self.attrs, self.device, self.jobs = catalog, attrs, device, jobs
        lx = os.path.join(atlas_dir, "lexicon.json")
        self.lexicon = [dict(w, group=g["group"]) for g in read_json(lx)["groups"] for w in g["words"]] if os.path.exists(lx) else []
        self.vocab = load_vocab(atlas_dir)
        self.cap = None; self.lock = threading.Lock(); self.state = {"id": None, "device": None, "phase": "idle", "message": ""}
        self._cfg_file = os.path.join(data_dir, "captioner.json")
        self.cfg = read_json(self._cfg_file) if os.path.exists(self._cfg_file) else {"id": None, "device": "auto"}

    # ---- what there is
    def listing(self, hw):
        """The readers with what this computer allows: on the graphics card if there is room beside the image model, on the processor if there is memory, else not at all."""
        ram = hardware.ram_free_mb(); out = []; cat = self.catalog
        for m in cat.readers():
            gpu = hw["kind"] in ("cuda", "mps") and hw["free_mb"] >= m["needs_vram_mb"] + 150
            if self.state["id"] == m["id"] and self.state["device"] in ("cuda", "mps"): gpu = True           # it already holds its memory
            cpu = ram is None or ram >= m["needs_ram_mb"] + 1024
            out.append({"id": m["id"], "name": m["name"], "tagline": m["tagline"], "mode": m["mode"], "available": m["available"], "size_mb": m.get("size_mb", 0), "needs_vram_mb": m["needs_vram_mb"],
                        "needs_ram_mb": m["needs_ram_mb"], "licence": m.get("licence", ""), "page": m.get("page", ""), "speed": m.get("speed", ""), "installed": cat.installed(m), "deletable": cat.owned(m),
                        "active": self.state["id"] == m["id"] and self.state["phase"] == "ready", "job": self.jobs.get(m["id"]),
                        "can_gpu": gpu, "can_cpu": cpu, "suggested": "gpu" if gpu else "cpu" if cpu else None})
        return out

    def summary(self):
        return {**self.state, "setting": self.cfg["device"], "vocab": [{"id": v["id"], "label": v["label"], "group": v["group"]} for v in self.vocab]}

    def look_words(self):
        """The words the reader compares a picture with: the registry's attributes first (position i is attribute i), then the words of the lexicon that are not attributes yet."""
        out = [{"phrase": a["phrase"], "label": a["label"], "group": a["group"], "attr": i} for i, a in enumerate(self.attrs.all())]
        have = {w["phrase"].lower() for w in out}
        return out + [{"phrase": w["phrase"], "label": w["label"], "group": w["group"], "attr": None} for w in self.lexicon if w["phrase"].lower() not in have]

    def attribute_added(self):
        if self.cap is not None and self.cap.reads_looks: self.cap.set_words([w["phrase"] for w in self.look_words()])

    # ---- on and off
    def activate(self, cid, device="auto"):
        m = self.catalog.entry(cid)
        if m.get("kind") != "captioner": raise KeyError(cid)
        if not self.catalog.installed(m): raise ValueError("install this reader first")
        if device not in ("auto", "gpu", "cpu"): raise ValueError("device must be auto, gpu or cpu")
        if self.state["phase"] == "loading": raise ValueError("a reader is already being loaded")
        self.cfg = {"id": cid, "device": device}; self._save_cfg()
        self.state = {"id": cid, "device": None, "phase": "loading", "message": "Loading " + m["name"]}
        threading.Thread(target=self._load, args=(m, device), daemon=True).start()

    def deactivate(self):
        self.cfg = {"id": None, "device": self.cfg.get("device", "auto")}; self._save_cfg()
        self._drop(); self.state = {"id": None, "device": None, "phase": "idle", "message": ""}

    def describe(self, jpg):
        """What the reader says about a picture, or None if there is no reader."""
        with self.lock:
            return self.cap.describe(jpg) if self.cap is not None else None

    def suspend(self):
        """A reader on the graphics card steps aside while an image model is loaded (it would take the memory the model needs); it comes back after (`resume`)."""
        if self.cap is not None and self.state["device"] in ("cuda", "mps"):
            self._drop(); self.state = {"id": self.cfg.get("id"), "device": None, "phase": "idle", "message": ""}

    def resume(self):
        cid = self.cfg.get("id")
        if cid and self.cap is None and self.state["phase"] != "loading":
            try: self.activate(cid, self.cfg.get("device", "auto"))
            except Exception: pass

    # ---- inside
    def _drop(self):
        with self.lock:
            if self.cap is not None: self.cap.unload()
            self.cap = None
        gc.collect()
        hardware.empty_cache(self.device)

    def _save_cfg(self): write_json(self._cfg_file, self.cfg)

    def _load(self, m, device):
        try:
            hw = hardware.detect(); lst = {c["id"]: c for c in self.listing(hw)}[m["id"]]
            want = lst["suggested"] if device == "auto" else device
            if want == "gpu" and not lst["can_gpu"]: raise RuntimeError("not enough free graphics memory for this reader (it needs about %d MB): use the processor, or free the card" % m["needs_vram_mb"])
            if want == "cpu" and not lst["can_cpu"]: raise RuntimeError("not enough free memory for this reader on the processor")
            if want is None: raise RuntimeError("this computer has no room for this reader")
            dev = self.device if want == "gpu" and self.device != "cpu" else "cpu"
            cap = create_reader(m, self.vocab, dev); cap.load(); cap.set_words([w["phrase"] for w in self.look_words()])
            with self.lock:
                if self.cap is not None: self.cap.unload()
                self.cap = cap
            self.state = {"id": m["id"], "device": dev, "phase": "ready", "message": ""}
        except Exception as e:
            self._drop()
            self.state = {"id": m["id"], "device": None, "phase": "error", "message": friendly(e)}
