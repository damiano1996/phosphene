"""A cell = (position on the concept map, seed) -> one image, deterministically (on one machine and model).

The position picks a concept (and a second one when it is about as close); the seed gives the noise and picks one of three prompt templates.
Prompt embeddings are computed once per (atlas version, model) and cached on disk, never shipped."""
import os

import torch

from collections import OrderedDict

from .atlas import STYLE_BY_SEED, Atlas, attrs_of, variant_of
from .backends import Backend


class Generator:
    def __init__(self, backend: Backend, atlas: Atlas, data_dir: str, device="cuda", phase=lambda name: None, attrs=None):
        self.backend, self.atlas, self.device, self.attrs = backend, atlas, device, attrs
        self.lazy = bool(attrs) and bool(getattr(backend, "lazy_prompts", False))          # a model that keeps its text encoder can make the prompts of attributes as they are asked for
        self.prompts = OrderedDict()                                                      # prompt text -> embedding, for those (a few thousand at most)
        phase("loading")
        backend.load(device)
        # how many finer kinds of each concept this model draws (a model that is slow to prepare its prompts, or whose embeddings are large, draws only the plain concept)
        self.variants = min(atlas.variants, getattr(backend, "variants", None) or atlas.variants)
        self.facets_tag = f"-f{atlas.facets_version}v{self.variants}" if self.variants > 1 else ""
        path = os.path.join(data_dir, f"embeds-{atlas.version}-{backend.id}{self.facets_tag}.pt")
        if os.path.exists(path):
            self.E = torch.load(path)
        else:
            phase("encoding")
            nt, nv = len(atlas.templates), self.variants
            print(f"first run with {backend.id}: encoding {len(atlas.names) * nt * nv} prompts", flush=True)
            flat = [atlas.prompt(c, s, v) for c in range(len(atlas.names)) for s in range(nt) for v in range(nv)]
            out = torch.cat([backend.encode_prompts(flat[i:i + 48]) for i in range(0, len(flat), 48)])
            self.E = out.view(len(atlas.names), nt, nv, *out.shape[1:])
            os.makedirs(data_dir, exist_ok=True)
            torch.save(self.E, path + ".tmp"); os.replace(path + ".tmp", path)
        if self.E.dim() == 4:                      # tables written before there were variants: (concept, style, tokens, dim)
            self.E = self.E.unsqueeze(2)
        backend.ready()

    @property
    def key(self):
        """What a client must send as `v=`: anything that changes the pixels is in it."""
        return f"{self.atlas.version}.{self.backend.id}.{self.backend.vae}{self.facets_tag}{'.a1' if self.lazy else ''}{self.backend.param_key()}"          # a1: the scheme of attributes in the seed; the number of attributes is not in it, or every new one would void every picture

    def render(self, items, size, watching=None, on_preview=None, _offset=0):
        """items: [(z, seed)] -> images. When `watching(i)` says someone looks at item i, `on_preview(i, step, total, picture)` gets its picture after each step."""
        n = self.backend.max_batch(size)
        if len(items) > n: return [im for i in range(0, len(items), n) for im in self.render(items[i:i + n], size, watching, on_preview, _offset + i)]
        progress = None
        if watching and on_preview:
            def progress(step, total, decode):
                if step >= total: return
                for noise in (False, True):
                    idx = [i for i in range(len(items)) if watching(_offset + i) == ("raw" if noise else "est")]
                    if idx:
                        for i, im in zip(idx, decode(idx, noise), strict=True): on_preview(_offset + i, step, total, im)
        pes = []
        wanted = []                                                # (concept, style, variant, attribute ids) of every item, and the prompts that are not known yet
        for z, seed in items:
            style, var = STYLE_BY_SEED[seed % len(STYLE_BY_SEED)], variant_of(seed, self.variants)
            ex = tuple(attrs_of(seed)) if self.lazy else ()
            ex = tuple(i for i in ex if self.attrs.phrase(i))
            wanted.append((self.atlas.pick(z), style, var, ex))
        self._learn_prompts(wanted)
        for pick, style, var, ex in wanted:
            pes.append(sum(w * (self.prompts[self._text(c, style, var, ex)] if ex else self.E[c, style, var]).float() for c, w in pick))
        return self.backend.render(torch.stack(pes), [s for _, s in items], size, progress)

    def _text(self, c, style, var, ex):
        return self.atlas.prompt(c, style, var, [self.attrs.phrase(i) for i in ex])

    def _learn_prompts(self, wanted, keep=4000):
        """Encodes, in one go, the prompts of this batch that carry attributes and are not in the cache (a few milliseconds each on the card)."""
        todo = []
        for pick, style, var, ex in wanted:
            if not ex: continue
            for c, _ in pick:
                t = self._text(c, style, var, ex)
                if t in self.prompts: self.prompts.move_to_end(t)
                elif t not in todo: todo.append(t)
        if not todo: return
        for t, e in zip(todo, self.backend.encode_prompts(todo), strict=True): self.prompts[t] = e
        while len(self.prompts) > keep: self.prompts.popitem(last=False)
