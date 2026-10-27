"""The concept atlas (atlas/atlas.tsv + atlas/templates.json): names, categories, colours, map coordinates and the prompt templates.

The coordinates come from CLIP and do not depend on the image model. What does depend on it is the text embedding of each prompt;
that is computed per model at first run (see generator.py), never stored in the atlas."""
import os

import numpy as np
from .util import read_json, read_text

SIGMA = 0.45             # how quickly the second concept's share falls as it gets farther than the nearest
MAX_SECOND = 2.2         # a second concept farther than this from the point is ignored
STYLE_BY_SEED = [0, 0, 0, 0, 1, 1, 1, 2]       # template 0 photo, 1 close-up photo, 2 painting
# THE LAYOUT OF A SEED (the web client's core/facets.js reads it the same way; web/test/facets.test.js checks both against the same values):
#   bits 0-2    which of the 8 slots of STYLE_BY_SEED (photo, close-up photo, painting)
#   bits 3-5    unused by the picture's content (they only choose among the slots of a style)
#   bits 6-7    the variant: a finer kind of the concept, 0 is the plain concept (atlas/facets.json)
#   bits 8-16   the first attribute asked for, plus one (0: none), an id of the registry in attrs.py
#   bits 17-25  the second attribute asked for, plus one (0: none)
#   bits 26-30  free; every bit still goes into the noise, so two cells never look the same
VARIANT_SHIFT, ATTR1_SHIFT, ATTR2_SHIFT, ATTR_MASK = 6, 8, 17, 0x1FF


def variant_of(seed, variants):
    return ((seed >> VARIANT_SHIFT) & 3) % variants if variants > 1 else 0


def attrs_of(seed):
    """-> the ids of the attributes a seed asks for (0, 1 or 2 of them)."""
    return [a - 1 for a in ((seed >> ATTR1_SHIFT) & ATTR_MASK, (seed >> ATTR2_SHIFT) & ATTR_MASK) if a > 0]


class Atlas:
    def __init__(self, directory):
        self.directory = directory
        lines = read_text(os.path.join(directory, "atlas.tsv")).splitlines()
        _, version, dim, _ = lines[0].split("\t")
        self.version, self.dim = int(version), int(dim)
        rows = [l.split("\t") for l in lines[1:]]
        self.cats = [r[0] for r in rows]
        self.names = [r[1] for r in rows]
        self.colors = np.array([[int(v) for v in r[2:5]] for r in rows])
        self.coords = np.array([[float(v) for v in r[5:5 + self.dim]] for r in rows], dtype=np.float32)
        t = read_json(os.path.join(directory, "templates.json"))
        self.templates, self.templates_not_photo, self.not_photo = t["templates"], t["templates_not_photo"], set(t["not_photo"])

        path = os.path.join(directory, "facets.json")
        f = read_json(path) if os.path.exists(path) else None
        self.variants = f["variants"] if f else 1
        self.facets_version = f["version"] if f else 0
        self._curated = f["curated"] if f else {}
        self._generic = f["generic"] if f else []

    def phrase(self, concept, variant):
        """What the cell shows: the concept's name, or for variant 1.. a finer kind of it (its own phrase, else the concept with a generic mood)."""
        name = self.names[concept]
        if variant <= 0 or self.variants <= 1: return name
        own = self._curated.get(name)
        return own[variant - 1]["phrase"] if own else f"{name} {self._generic[variant - 1]['phrase']}"

    def prompt(self, concept, style, variant=0, extras=()):
        table = self.templates_not_photo if self.cats[concept] in self.not_photo else self.templates
        return table[style].format(", ".join([self.phrase(concept, variant), *extras]))

    def pick(self, z):
        """-> [(concept index, weight)]: the nearest concept, and the second one when it is about as close."""
        d = np.linalg.norm(self.coords - np.asarray(z, np.float32), axis=1)
        o = np.argsort(d)[:2]
        w2 = float(np.exp(-(d[o[1]] ** 2 - d[o[0]] ** 2) / (2 * SIGMA ** 2))) if d[o[1]] < MAX_SECOND else 0.0
        return [(int(o[0]), 1.0)] if w2 < 0.12 else [(int(o[0]), 1 / (1 + w2)), (int(o[1]), w2 / (1 + w2))]
