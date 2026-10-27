"""Image backends. A backend turns prompt embeddings plus noise seeds into images; it must accept *embeddings*, not only text, because a cell can blend two concepts by mixing their
embeddings (a backend that only takes a text prompt cannot do that).

The catalogue says which backend draws a model (`"backend": "flux"` in catalog.json). A backend is registered by name and imported only when it is used, so a machine that never loads
FLUX never imports what FLUX needs. To add one: write a `Backend` subclass (see base.py), then `register("my-kind", "my_package.module:MyClass")`; a class that takes the catalogue
entry as its only argument gets it, one that takes none is built without it."""
import importlib
import inspect

from .base import Backend

_REGISTRY = {}


def register(kind: str, target: str):
    """`target` is "module:Class", the module being absolute or relative to this package (".flux:Flux")."""
    _REGISTRY[kind] = target


def kinds():
    return sorted(_REGISTRY)


def create(entry):
    """entry: a catalogue entry (see catalog.json); its "backend" says which class draws it."""
    kind = entry.get("backend")
    if kind not in _REGISTRY: raise ValueError(f"model '{entry.get('id')}' has no backend yet")
    module, _, name = _REGISTRY[kind].partition(":")
    cls = getattr(importlib.import_module(module, package=__package__), name)
    return cls(entry) if len(inspect.signature(cls).parameters) else cls()


for _kind, _target in (("sdturbo", ".sdturbo:SdTurbo"), ("lcm", ".lcm:Lcm"), ("sd-generic", ".generic:SdGeneric"), ("flux", ".flux:Flux"), ("sana", ".sana:Sana"), ("sdxl", ".sdxl:Sdxl")):
    register(_kind, _target)

__all__ = ["Backend", "create", "register", "kinds"]
