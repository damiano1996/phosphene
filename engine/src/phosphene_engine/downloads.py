"""Downloads and deletions of models, with progress. One job per model; the web page reads the jobs through the listing."""
import os
import threading

from huggingface_hub import snapshot_download
from tqdm.auto import tqdm

from .catalog import Catalog, cached, friendly
from .hardware import MB


class Downloads:
    def __init__(self, catalog: Catalog):
        self.catalog = catalog
        self.lock = threading.Lock()
        self.jobs = {}                               # model id -> {"state", "done", "total", "message"}

    def install(self, model_id):
        m = self.catalog.entry(model_id)
        if not m["available"]: raise ValueError("this model is not available yet")
        with self.lock:
            if self.jobs.get(model_id, {}).get("state") == "downloading": return
            self.jobs[model_id] = {"state": "downloading", "done": 0, "total": m.get("size_mb", 0) * MB, "message": ""}
        threading.Thread(target=self._download, args=(m,), daemon=True).start()

    def _download(self, m):
        job = self.jobs[m["id"]]; finished = [0]

        class Bar(tqdm):
            def update(self, n=1):
                r = super().update(n)
                if self.desc == "Downloading bytes" and self.total:
                    job["done"] = min(job["total"], finished[0] + self.n)
                    job["part_total"] = self.total
                return r
        try:
            fresh = []
            for part in m["parts"]:
                missing = [f for f in part["files"] if not cached(part["repo"], f)]
                fresh += [f"{part['repo']}::{f}" for f in missing]
                job["part_total"] = 0
                if missing: snapshot_download(part["repo"], allow_patterns=missing, tqdm_class=Bar)
                finished[0] += job.get("part_total", 0)
            bad = [f"{p['repo']}/{f}" for p in m["parts"] for f in p["files"] if not cached(p["repo"], f)]
            if bad: raise RuntimeError("download finished but files are missing: " + ", ".join(bad[:3]))
            self.catalog.mark_downloaded(fresh)
            job.update(state="done", done=job["total"], message="")
        except Exception as e:
            job.update(state="error", message=friendly(e))

    def delete(self, model_id, in_use=lambda model_id: None):
        """Removes the files this program downloaded for the model and nothing else (what another installed model uses, or was there before, stays).
        `in_use` raises ValueError with the reason if the model cannot go now."""
        cat = self.catalog; m = cat.entry(model_id)
        if self.jobs.get(model_id, {}).get("state") == "downloading": raise ValueError("wait for the download to finish")
        in_use(model_id)
        still_needed = {f"{p['repo']}::{f}" for o in cat.models if o["id"] != model_id and cat.installed(o) for p in o["parts"] for f in p["files"]}
        removed = 0
        for p in m["parts"]:
            for f in p["files"]:
                key = f"{p['repo']}::{f}"
                if key not in cat.managed or key in still_needed: continue          # not ours, or another installed model uses it
                path = cached(p["repo"], f)
                if path:
                    blob = os.path.realpath(path); os.remove(path)
                    if os.path.exists(blob) and os.path.isfile(blob): os.remove(blob)
                    removed += 1
                cat.managed.discard(key)
        cat.save_marker(); self.jobs.pop(model_id, None)
        if m.get("user"): cat.forget_user_model(model_id)
        return removed
