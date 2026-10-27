"""The attributes a cell can ask for on top of its concept and kind ("pale limestone rock", "golden hour light", "fog and mist").

The registry belongs to the engine and only ever grows: an attribute's id is its position and is never reused or reordered, because ids are written into seeds (see atlas.py).
The first ones are those of atlas/facets.json, in its order; the ones discovered later (see /attrs/add) are kept in the data folder."""
import os
import threading
from .util import read_json, write_json

CAPACITY = 96            # ids 0..95: the web client's model has this many slots for them, and a seed has room for 511


class Attrs:
    def __init__(self, atlas_dir, data_dir):
        path = os.path.join(atlas_dir, "facets.json")
        f = read_json(path) if os.path.exists(path) else {"attributes": [], "nature": []}
        self.base = list(f["attributes"]); self.nature = f.get("nature", [])
        self.path = os.path.join(data_dir, "attrs.json"); self.lock = threading.Lock()
        self.extra = []
        if os.path.exists(self.path):
            try: self.extra = read_json(self.path).get("extra", [])
            except Exception: self.extra = []

    capacity = CAPACITY

    def all(self):
        return [{**a, "id": a["id"]} for a in self.base + self.extra]

    def phrase(self, i):
        a = self.all()
        return a[i]["phrase"] if 0 <= i < len(a) else None

    def add(self, label, phrase, group="discovered"):
        """-> the id of the attribute with this phrase (a new one if there was none). Ids are never reused."""
        label, phrase = " ".join(str(label).split())[:40], " ".join(str(phrase).split())[:60]
        if not label or not phrase: raise ValueError("an attribute needs a label and a phrase")
        with self.lock:
            for i, a in enumerate(self.base + self.extra):
                if a["phrase"].lower() == phrase.lower(): return i
            n = len(self.base) + len(self.extra)
            if n >= CAPACITY: raise ValueError("no room for more attributes")
            self.extra.append({"id": f"x{n}", "label": label, "group": group, "phrase": phrase})
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            write_json(self.path, {"extra": self.extra})
            return n
