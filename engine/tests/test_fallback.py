"""A model switch that fails leaves the engine on the model that was in use, and says what went wrong."""
from types import SimpleNamespace

import pytest

pytest.importorskip("torch")
from phosphene_engine.manager import Manager  # noqa: E402


def make(loaded):
    m = Manager.__new__(Manager)
    m.entry = lambda i: {"name": i.upper()}
    m.readers = SimpleNamespace(suspend=lambda: None, resume=lambda: None)
    m.activation = {}

    def fake_load(model_id):
        if model_id == "bad": raise RuntimeError("out of memory")
        loaded.append(model_id)

    m._load = fake_load
    return m


def test_a_failed_switch_loads_the_previous_model_again():
    loaded = []; m = make(loaded)
    m._activate("a")
    assert m.activation == {"model": "a", "phase": "ready", "message": ""} and m.active_id == "a"
    m._activate("bad")
    assert m.activation["phase"] == "ready" and m.activation["model"] == "a"
    assert m.activation["failed"]["model"] == "bad" and "memory" in m.activation["failed"]["message"]
    assert loaded == ["a", "a"] and m.active_id == "a"


def test_with_nothing_to_go_back_to_the_error_says_so():
    m = make([]); m._activate("bad")
    assert m.activation["phase"] == "error" and m.activation["model"] == "bad"
