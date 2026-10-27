"""Draws the pictures that are asked for.

Requests are batched (several at a time is faster per image) and every picture is cached on disk by its exact (rounded) position and seed, so asking again, now or after a restart, is
instant. A job waits in `inflight` until it is drawn; a person who looks at a picture being drawn can ask for its steps (`peek`)."""
import hashlib
import io
import os
import queue
import threading
import time
from .util import read_bytes


class RenderQueue:
    def __init__(self, mgr, batch: int):
        self.mgr, self.batch = mgr, batch
        self.jobs, self.inflight, self.lock = queue.Queue(), {}, threading.Lock()
        self.stats = {"generated": 0, "cached": 0, "gen_seconds": 0.0, "started": time.time()}
        threading.Thread(target=self._worker, daemon=True).start()

    @staticmethod
    def key_of(gen, z, seed, s):
        return hashlib.sha1((f"{gen.key}:{s}:{seed}:" + ",".join("%.2f" % v for v in z)).encode()).hexdigest()

    def cache_path(self, gen, key):
        return os.path.join(self.mgr.cache_dir(gen), key + ".jpg")

    def fetch_jpg(self, gen, z, seed, s):
        """The picture of a cell: from the disk cache, or drawn now (waiting for it if it is already being drawn)."""
        key = self.key_of(gen, z, seed, s); path = self.cache_path(gen, key)
        if os.path.exists(path):
            self.stats["cached"] += 1
            return read_bytes(path)
        with self.lock:
            job = self.inflight.get(key)
            if job is None:
                job = self.inflight[key] = {"key": key, "gen_key": gen.key, "z": z, "seed": seed, "size": s, "event": threading.Event(), "jpg": None}; self.jobs.put(job)
        job["event"].wait(60)
        return job["jpg"]

    def peek(self, key, raw: bool):
        """(step, total, jpeg) of a picture being drawn, None if nothing yet, False if it is not being drawn."""
        with self.lock: job = self.inflight.get(key)
        if job is None: return False
        job["watch"] = "raw" if raw else "est"
        return job.get("preview")

    def snapshot(self):
        s = dict(self.stats); s["avg_ms"] = round(1000 * s["gen_seconds"] / max(1, s["generated"]), 1); s["queue"] = self.jobs.qsize()
        return s

    def _worker(self):
        while True:
            group = [self.jobs.get()]
            t0 = time.time()
            while len(group) < self.batch and time.time() - t0 < 0.03:
                try: group.append(self.jobs.get(timeout=0.01))
                except queue.Empty: pass
            try:
                by_size = {}
                for b in group: by_size.setdefault(b["size"], []).append(b)
                with self.mgr.gen_lock:                       # a model swap waits for this batch; a batch for a model that has gone is dropped
                    gen = self.mgr.gen
                    if gen is None: raise RuntimeError("no model loaded")
                    for s, bs in by_size.items():
                        bs = [b for b in bs if b["gen_key"] == gen.key]
                        if bs: self._draw(gen, s, bs)
            except Exception as e:                       # one bad batch must not stop the engine
                print("render failed:", e, flush=True)
            for b in group:
                with self.lock: self.inflight.pop(b["key"], None)
                b["event"].set()

    def _draw(self, gen, s, bs):
        t = time.time()

        def preview(i, step, total, im):
            im.thumbnail((384, 384)); buf = io.BytesIO(); im.save(buf, "JPEG", quality=75); bs[i]["preview"] = (step, total, buf.getvalue())

        imgs = gen.render([(b["z"], b["seed"]) for b in bs], s, watching=lambda i: bs[i].get("watch"), on_preview=preview)
        self.stats["gen_seconds"] += time.time() - t; self.stats["generated"] += len(bs)
        cache_dir = self.mgr.cache_dir(gen)
        for b, im in zip(bs, imgs, strict=True):
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=92); b["jpg"] = buf.getvalue()
            with open(os.path.join(cache_dir, b["key"] + ".jpg"), "wb") as f: f.write(b["jpg"])
