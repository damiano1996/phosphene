"""Rebuilds the atlas from concepts.py:   engine/.venv/bin/python atlas/build_atlas.py     (needs:  cd engine && uv sync --extra atlas)

  - a 12-D map of the concepts from CLIP's text embeddings (built for similarity), whitened PCA;
  - a representative colour per concept (one render with the default model), used for instant placeholders;
  - templates.json, the prompt templates.
Writes atlas.tsv and templates.json next to this file. Prompt embeddings are NOT written: they depend on the image model and are computed by the engine
at first run. Append new categories at the end of concepts.py so existing concept ids keep their meaning.

Re-running it changes atlas.tsv's version, and what people had learned is then set aside (see docs/EXTENDING.md)."""
import hashlib
import json
import os

import numpy as np
import open_clip
import torch
from sklearn.decomposition import PCA

from concepts import NOT_PHOTO, TEMPLATES, TEMPLATES_NOT_PHOTO, all_concepts

HERE = os.path.dirname(os.path.abspath(__file__))
DIM = 12
cs = all_concepts(); cats = [c for c, _ in cs]; names = [s for _, s in cs]

clip, _, _ = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
tok = open_clip.get_tokenizer("ViT-B-32"); clip.eval()
with torch.no_grad():
    E = clip.encode_text(tok(["a photo of " + n for n in names]))
    E = (E / E.norm(dim=-1, keepdim=True)).numpy()
coords = PCA(n_components=DIM, whiten=True, random_state=0).fit_transform(E).astype(np.float32)
del clip

from phosphene_engine.backends import create
backend = create({"id": "sd-turbo", "backend": "sdturbo"}); backend.load("cuda")
colors = []
for i in range(0, len(cs), 4):
    batch = list(range(i, min(i + 4, len(cs))))
    emb = backend.encode_prompts(["a photo of " + names[j] for j in batch])
    for im in backend.render(emb, [0] * len(batch), 256):
        colors.append([int(v) for v in np.asarray(im.resize((16, 16)), np.float32).reshape(-1, 3).mean(0).round()])

version = int(hashlib.sha1((",".join(names) + np.round(coords, 3).tobytes().hex()).encode()).hexdigest()[:7], 16)
with open(os.path.join(HERE, "atlas.tsv"), "w") as f:
    f.write(f"version\t{version}\t{DIM}\t{len(cs)}\n")
    for i in range(len(cs)):
        f.write("\t".join([cats[i], names[i]] + [str(c) for c in colors[i]] + ["%.3f" % v for v in coords[i]]) + "\n")
json.dump({"templates": TEMPLATES, "templates_not_photo": TEMPLATES_NOT_PHOTO, "not_photo": sorted(NOT_PHOTO)}, open(os.path.join(HERE, "templates.json"), "w"), indent=1)
nn = [np.sort(np.linalg.norm(coords - coords[i], axis=1))[1] for i in range(len(cs))]
print(f"atlas version {version}: {len(cs)} concepts, {len(set(cats))} categories; nearest-concept distance median {np.median(nn):.2f}")
