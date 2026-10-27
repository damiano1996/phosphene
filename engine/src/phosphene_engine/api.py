"""The engine's HTTP API, as plain functions of a request: no sockets here, so it can be tested without a server (and without PyTorch).

    GET  /health                     status, atlas, model, key (null while no model is loaded), kinds per concept, phase, free VRAM    (open: no secret)
    GET  /models                     hardware, the catalogue (installed, fits, downloading), the model being loaded, the readers
    POST /models/install|activate|delete|params|add
    GET  /img?z=..&seed=..&v=<key>[&s=512]       image/jpeg          GET /peek (a picture being drawn), GET /caption (what the reader says)
    GET  /user, PUT /user            the person's data (see userdata.py)     GET /saved/<id>.jpg, POST /saved/add|remove
    GET  /atlas.tsv /facets.json /attrs /lexicon   the content the page is made of        POST /attrs/add, /captioner/activate|off, /quit
    GET  /stats                      counters

Everything but /health and the page's first visit needs the secret (see security.py). A request whose `v` is not the engine's key is refused (409) rather than drawn with another
model, atlas or decoder. To add an endpoint, write a method and add it to `Api.routes`."""
import json
import os
import re
import threading
import time
from dataclasses import dataclass, field

from .security import Guard
from .userdata import MAX_USER_BYTES, UserStore
from .util import read_bytes, round_z

STATIC_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".wav": "audio/wav"}
CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
JSON = "application/json"


@dataclass
class Request:
    method: str
    path: str
    query: dict                      # name -> [values], as urllib.parse.parse_qs gives
    headers: object                  # anything with .get(name)
    read_body: object = lambda n: b""     # reads n bytes of the body (only when a route asks for it)

    @property
    def length(self): return int(self.headers.get("Content-Length") or 0)

    def arg(self, name, default=None):
        v = self.query.get(name); return v[0] if v else default


@dataclass
class Reply:
    code: int
    body: bytes = b""
    ctype: str = "text/plain"
    headers: dict = field(default_factory=dict)
    after: object = None             # called once the answer has been sent


def ok(obj=None): return Reply(200, b"{}" if obj is None else json.dumps(obj).encode(), JSON)
def err(code, msg): return Reply(code, msg.encode() if isinstance(msg, str) else msg)


class Api:
    def __init__(self, mgr, guard: Guard, renders, users: UserStore, size: int, atlas_dir=None, web_dir=None, free_vram=lambda: 0):
        self.mgr, self.guard, self.renders, self.users, self.size = mgr, guard, renders, users, size
        self.atlas_dir, self.web_dir, self.free_vram = atlas_dir, web_dir, free_vram
        self.reads = {}              # what the reader said about a picture, so that asking twice costs nothing
        # (method, path or compiled pattern, handler, needs the secret)
        self.routes = [
            ("GET", "/health", self.health, False), ("GET", "/models", lambda r: ok(self.mgr.listing()), True), ("GET", "/stats", lambda r: ok(self.renders.snapshot()), True),
            ("GET", "/attrs", self.attrs, True), ("GET", "/lexicon", lambda r: ok({"words": self.mgr.look_words()}), True),
            ("GET", "/facets.json", self.facets, True), ("GET", "/atlas.tsv", self.atlas, True), ("GET", "/user", self.get_user, True), ("PUT", "/user", self.put_user, True),
            ("GET", re.compile(r"^/saved/([0-9a-f]{16})\.jpg$"), self.saved_picture, True),
            ("GET", "/img", self.img, True), ("GET", "/peek", self.peek, True), ("GET", "/caption", self.caption, True),
            ("POST", "/saved/add", self.saved_add, True), ("POST", "/saved/remove", self.saved_remove, True),
            ("POST", "/attrs/add", self.attrs_add, True), ("POST", "/captioner/activate", self.captioner_on, True), ("POST", "/captioner/off", self.captioner_off, True),
            ("POST", "/quit", self.quit, True), ("POST", "/models/add", self.model_add, True), ("POST", "/models/params", self.model_params, True),
            ("POST", "/models/install", lambda r: self._model_do(r, self.mgr.install), True), ("POST", "/models/activate", lambda r: self._model_do(r, self.mgr.activate), True),
            ("POST", "/models/delete", lambda r: self._model_do(r, self.mgr.delete), True),
        ]
        self._get_paths = {p for m, p, _, _ in self.routes if m == "GET" and isinstance(p, str)}

    # ------------------------------------------------------------------------------------------- dispatch
    def handle(self, req: Request) -> Reply:
        g = self.guard
        if req.method == "GET":
            if not g.host_ok(req.headers): return err(403, "unknown host")
            if not self._is_api(req.path): return self._page(req)
        elif not g.host_ok(req.headers) or not g.origin_ok(req.headers): return err(403, "forbidden")
        for method, path, fn, secret in self.routes:
            if method != req.method: continue
            m = None
            if isinstance(path, str):
                if req.path != path: continue
            else:
                m = path.match(req.path)
                if not m: continue
            if secret and not g.authorised(req.headers, req.query): return err(403, "forbidden")
            return fn(req, m) if m else fn(req)
        if not g.authorised(req.headers, req.query): return err(403, "forbidden")
        return err(404, "not found")

    def _is_api(self, path):
        return path in self._get_paths or path.startswith("/saved/")

    # ------------------------------------------------------------------------------------------- the page itself
    def _page(self, req):
        """The web client: a file of the web folder (only known types, never outside it). The first visit from the launcher's link sets the cookie and goes to /."""
        g = self.guard
        if req.path == "/" and g.token and "t" in req.query and g.authorised(req.headers, req.query):
            return Reply(302, b"", "text/plain", {"Location": "/", "Set-Cookie": g.session_cookie()})
        if not g.authorised(req.headers, req.query): return err(403, "Open Phosphene from the link it printed when it started (it contains a key).")
        if self.web_dir is None: return err(404, "no web client here")
        rel = "index.html" if req.path in ("", "/") else req.path.lstrip("/")
        full = os.path.realpath(os.path.join(self.web_dir, rel)); root = os.path.realpath(self.web_dir); parts = rel.split("/")
        if (not full.startswith(root + os.sep)) or "test" in parts or "tools" in parts or "node_modules" in parts or parts[-1] == "package.json" or os.path.splitext(full)[1] not in STATIC_TYPES or not os.path.isfile(full):
            return err(404, "not found")
        ctype = STATIC_TYPES[os.path.splitext(full)[1]]
        return Reply(200, read_bytes(full), ctype, {"Content-Security-Policy": CSP} if ctype.startswith("text/html") else {})

    # ------------------------------------------------------------------------------------------- state of the engine
    def health(self, r):
        gen = self.mgr.gen
        return ok({"status": "ok", "atlas": self.mgr.atlas.version, "model": gen.backend.id if gen else None, "vae": gen.backend.vae if gen else None, "key": gen.key if gen else None,
                   "variants": gen.variants if gen else 1, "attrs": bool(gen and gen.lazy), "phase": self.mgr.activation["phase"], "size": self.size, "vram_free_mb": self.free_vram()})

    def attrs(self, r): return ok({"attrs": self.mgr.attrs.all(), "nature": self.mgr.attrs.nature, "base": len(self.mgr.attrs.base), "capacity": self.mgr.attrs.capacity})

    def attrs_add(self, r):
        """A look the page found that the person likes becomes an attribute (ids are never reused; the reader compares pictures with it from now on)."""
        try: i = self.mgr.add_attr(r.query["label"][0], r.query["phrase"][0], r.arg("group", "discovered"))
        except (KeyError, ValueError) as e: return err(400, str(e))
        self.reads.clear()
        return ok({"id": i})

    def _content(self, name, ctype, extra=None):
        p = os.path.join(self.atlas_dir, name) if self.atlas_dir else None
        return Reply(200, read_bytes(p), ctype, extra or {}) if p and os.path.exists(p) else err(404, "not found")

    def facets(self, r): return self._content("facets.json", JSON)
    def atlas(self, r): return self._content("atlas.tsv", "text/tab-separated-values; charset=utf-8", {"X-Atlas": "1"})

    # ------------------------------------------------------------------------------------------- the person's data
    def get_user(self, r): return Reply(200, self.users.read(), JSON, {"X-User": "1", "X-Epoch": self.users.epoch})

    def put_user(self, r):
        if r.headers.get("X-Epoch") != self.users.epoch: return err(409, "stale: this page was opened before the data was reset; reload it")
        if r.length > MAX_USER_BYTES: return err(413, "too large")          # (checked before reading the body)
        try: self.users.write(r.read_body(r.length))
        except ValueError as e: return err(400, str(e))
        return ok()

    def saved_picture(self, r, m):
        jpg = self.users.picture(m.group(1))
        return Reply(200, jpg, "image/jpeg") if jpg else err(404, "not found")

    def saved_add(self, r):
        """Keeps the picture of this cell as it is now (copied: another model will draw the cell differently)."""
        gen = self.mgr.gen
        if gen is None: return err(503, "no model loaded")
        cell = self._cell(r, "bad request")
        if isinstance(cell, Reply): return cell
        z, s, seed, ver = cell
        if ver != gen.key: return err(409, f"version mismatch: engine has {gen.key}")
        jpg = self.renders.fetch_jpg(gen, z, seed, s)
        if jpg is None: return err(503, "generation failed")
        return ok({"id": self.users.save_picture(jpg, f"{gen.key}:{s}:{seed}:{z}")})

    def saved_remove(self, r):
        try: self.users.remove_picture(r.arg("id", ""))
        except ValueError as e: return err(400, str(e))
        return ok()

    # ------------------------------------------------------------------------------------------- pictures
    def _cell(self, r, message):
        """z, size, seed and version key of a picture request, or a 400 reply."""
        try:
            z = round_z(r.query["z"][0].split(",")); s = int(r.arg("s", self.size)); seed = int(r.query["seed"][0]); ver = r.query["v"][0]
            assert len(z) == self.mgr.atlas.dim and 64 <= s <= 1024 and s % 8 == 0
        except Exception: return err(400, message)
        return z, s, seed, ver

    def _picture_request(self, r):
        gen = self.mgr.gen
        if gen is None: return err(503, "no model loaded")
        cell = self._cell(r, "bad request: z=<dim comma separated numbers>, seed, v, s a multiple of 8")
        if isinstance(cell, Reply): return cell
        z, s, seed, ver = cell
        if ver != gen.key: return err(409, f"version mismatch: engine has {gen.key}")
        return gen, z, seed, s

    def img(self, r):
        p = self._picture_request(r)
        if isinstance(p, Reply): return p
        gen, z, seed, s = p
        jpg = self.renders.fetch_jpg(gen, z, seed, s)
        return Reply(200, jpg, "image/jpeg") if jpg is not None else err(503, "generation failed")

    def peek(self, r):
        """The picture so far of one that is being drawn (asking is what makes the engine decode its steps); 404 once it is done or not started."""
        p = self._picture_request(r)
        if isinstance(p, Reply): return p
        gen, z, seed, s = p
        pv = self.renders.peek(self.renders.key_of(gen, z, seed, s), r.arg("raw", "0") == "1")
        if pv is False: return err(404, "not being drawn")
        if pv is None: return Reply(204)
        return Reply(200, pv[2], "image/jpeg", {"X-Step": str(pv[0]), "X-Steps": str(pv[1])})

    def caption(self, r):
        """What the reader of pictures says about a finished picture (404: no reader, or the picture is not made yet)."""
        p = self._picture_request(r)
        if isinstance(p, Reply): return p
        gen, z, seed, s = p; mgr = self.mgr
        if mgr.cap is None: return err(404, "no reader")
        key = self.renders.key_of(gen, z, seed, s); path = self.renders.cache_path(gen, key)
        if not os.path.exists(path): return err(404, "picture not ready")
        ck = (mgr.cap_state["id"], key); out = self.reads.get(ck)
        if out is None:
            out = mgr.describe(read_bytes(path))
            if out is None: return err(404, "no reader")
            if len(self.reads) > 4000: self.reads.clear()
            self.reads[ck] = out
        return Reply(200, json.dumps(out).encode(), JSON, {"X-Caption": "1"})

    # ------------------------------------------------------------------------------------------- models and readers
    def _model_do(self, r, fn):
        try: fn(r.query["id"][0])
        except (KeyError, ValueError) as e: return err(400, str(e))      # (a bad id or a value out of range is the caller's mistake)
        return ok()

    def model_add(self, r):
        try: return ok({"id": self.mgr.add_user_model(r.query["repo"][0])})
        except (KeyError, ValueError) as e: return err(400, str(e))

    def model_params(self, r):
        try: self.mgr.set_params(r.query["id"][0], {k: x[0] for k, x in r.query.items() if k not in ("id", "t", "reset")}, reset="reset" in r.query)
        except (KeyError, ValueError) as e: return err(400, str(e))
        return ok()

    def captioner_on(self, r):
        try: self.mgr.activate_captioner(r.query["id"][0], r.arg("device", "auto"))
        except (KeyError, ValueError) as e: return err(400, str(e))
        return ok()

    def captioner_off(self, r): self.mgr.deactivate_captioner(); return ok()

    def quit(self, r):
        return Reply(200, b"{}", JSON, after=lambda: threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start())
