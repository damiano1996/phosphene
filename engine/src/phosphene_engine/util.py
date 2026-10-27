"""Small helpers with no heavy dependencies (so that the HTTP layer can be tested without PyTorch)."""


def default_data_dir():
    """Where a person's data lives: the usual per-user folder of each system (Linux keeps ~/.local/share/phosphene)."""
    import os, sys
    home = os.path.expanduser("~")
    if sys.platform == "win32": base = os.environ.get("APPDATA") or os.path.join(home, "AppData", "Roaming")
    elif sys.platform == "darwin": base = os.path.join(home, "Library", "Application Support")
    else: base = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
    return os.path.join(base, "phosphene")


def round_z(z):
    """A position on the concept map as the engine knows it: two decimals. It is what the cache key and the image are made from."""
    return [round(float(v), 2) for v in z]


def read_text(path):
    with open(path) as f: return f.read()


def read_bytes(path):
    with open(path, "rb") as f: return f.read()


def read_json(path):
    import json
    with open(path) as f: return json.load(f)


def write_text(path, text):
    with open(path, "w") as f: f.write(text)


def write_json(path, obj, **kw):
    """Atomically: a reader (or a crash) never sees half a file."""
    import json
    import os
    with open(path + ".tmp", "w") as f: json.dump(obj, f, **kw)
    os.replace(path + ".tmp", path)
