"""The memory of a Mac, read from vm_stat, and the rule that a Mac's graphics chip counts as a graphics card."""
import subprocess
from types import SimpleNamespace

import pytest

pytest.importorskip("torch")                       # the hardware module imports PyTorch; the CI job that has none skips this file
from phosphene_engine import hardware  # noqa: E402

VM_STAT = """Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               10000.
Pages active:                             50000.
Pages inactive:                           20000.
Pages speculative:                         2000.
"""


def test_mac_memory_is_free_plus_inactive_plus_speculative(monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: SimpleNamespace(stdout=VM_STAT))
    total, avail = hardware._mac_memory()
    assert avail == (10000 + 20000 + 2000) * 16384 // hardware.MB and total > 0


def test_an_apple_chip_is_a_graphics_card_for_the_fit_rule():
    mps = {"kind": "mps", "total_mb": 12000, "free_mb": 9000, "own_mb": 0}
    assert hardware.fit(mps, 2900) == "ok" and hardware.fit(mps, 20000) == "too_small"
    assert hardware.fit({"kind": "cpu", "total_mb": 0, "free_mb": 0, "own_mb": 0}, 2900) == "no_gpu"
