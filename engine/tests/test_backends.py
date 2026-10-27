"""The backend registry: a backend is found by the name the catalogue gives it, and only imported when it is used."""
import sys
import types

import pytest

from phosphene_engine import backends


def test_the_shipped_backends_are_registered():
    assert {"sdturbo", "lcm", "sd-generic", "flux", "sana", "sdxl"} <= set(backends.kinds())


def test_a_backend_from_another_package_can_be_registered_and_is_given_its_entry():
    class Mine(backends.Backend):
        id = "mine"; vae = "v"; min_free_vram_mb = 1
        def __init__(self, entry): self.entry = entry; super().__init__()
        def load(self, device): pass
        def encode_prompts(self, prompts): return prompts
        def render(self, embeds, seeds, size, progress=None): return []

    mod = types.ModuleType("my_backend_pkg"); mod.Mine = Mine; sys.modules["my_backend_pkg"] = mod
    backends.register("mine", "my_backend_pkg:Mine")
    b = backends.create({"id": "x", "backend": "mine"})
    assert isinstance(b, Mine) and b.entry["id"] == "x"


def test_a_model_with_no_backend_is_refused_with_its_name():
    with pytest.raises(ValueError, match="nope"):
        backends.create({"id": "nope", "backend": "does-not-exist"})
