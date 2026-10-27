"""What this computer can run. Tiers are decided on the card's total memory (what it is able to run); what is free right now is reported separately,
because it depends on what else is using the card (including this engine's own loaded model).

The numbers come from nvidia-smi when it is there, so looking at the hardware does not itself create a CUDA context (that takes memory, and fails
outright when the card is full)."""
import os
import subprocess
import sys

import torch

from .util import read_text

MB = 2 ** 20


def _smi():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=8).stdout
        name, total, free = [x.strip() for x in out.splitlines()[0].split(",")]
        return name, int(total), int(free)
    except Exception:
        return None


def _mac_memory():
    """(total, available) in MB of this Mac's memory, which the processor and the graphics chip share."""
    total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // MB
    try:
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
        page = int(out.split("page size of")[1].split("bytes")[0]); n = {k.strip(): int(v.strip().rstrip(".")) for k, v in (l.split(":") for l in out.splitlines() if ":" in l and l.split(":")[1].strip().rstrip(".").isdigit())}
        return total, (n.get("Pages free", 0) + n.get("Pages inactive", 0) + n.get("Pages speculative", 0)) * page // MB
    except Exception:
        return total, total // 2


def _apple():
    """The Apple graphics chip (Metal, 'mps' in PyTorch), when there is one. Its memory is the Mac's: the model may use about two thirds of it."""
    try:
        if not (sys.platform == "darwin" and torch.backends.mps.is_available()): return None
        name = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True, timeout=5).stdout.strip() or "Apple GPU"
        total, avail = _mac_memory()
        return {"kind": "mps", "name": name, "total_mb": total * 2 // 3, "free_mb": min(avail, total * 2 // 3), "own_mb": 0}
    except Exception:
        return None


def empty_cache(device):
    """Gives back the memory the graphics side keeps for itself (after a model is dropped)."""
    if device == "cuda": torch.cuda.empty_cache()
    elif device == "mps": torch.mps.empty_cache()


def detect():
    mac = _apple()
    if mac: return mac
    own = torch.cuda.memory_reserved() // MB if torch.cuda.is_available() and torch.cuda.is_initialized() else 0
    smi = _smi()
    if smi: return {"kind": "cuda", "name": smi[0], "total_mb": smi[1], "free_mb": smi[2], "own_mb": own}
    try:
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            return {"kind": "cuda", "name": torch.cuda.get_device_properties(0).name, "total_mb": total // MB, "free_mb": free // MB, "own_mb": own}
    except Exception:
        pass
    return {"kind": "cpu", "name": "no supported GPU found", "total_mb": 0, "free_mb": 0, "own_mb": 0}


def fit(hw, needs_mb):
    """'ok', 'busy' (the card is big enough but something else holds the memory now) or 'too_small' / 'no_gpu'."""
    if hw["kind"] not in ("cuda", "mps"): return "no_gpu"
    if hw["total_mb"] < needs_mb: return "too_small"
    return "ok" if hw["free_mb"] + hw["own_mb"] >= needs_mb else "busy"


def ram_free_mb():
    """Memory the processor side can still use (MB), or None when it cannot be told."""
    if sys.platform == "darwin": return _mac_memory()[1]
    if sys.platform == "win32":
        try:
            import ctypes

            class Status(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(n, ctypes.c_ulonglong) for n in ("total", "avail", "ptotal", "pavail", "vtotal", "vavail", "ext")]
            st = Status(); st.length = ctypes.sizeof(Status); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return st.avail // MB
        except Exception:
            return None
    try:
        for line in read_text("/proc/meminfo").splitlines():
            if line.startswith("MemAvailable:"): return int(line.split()[1]) // 1024
    except Exception:
        pass
    return None
