"""What belongs to the person, on their computer: one file (`user.json`: choices, saved pictures, what was learned), the pictures they saved, and the epoch.

The epoch is new whenever the folder starts without a `user.json` (a fresh start). A page opened before that and still holding the old state would otherwise write it back over the
fresh start the next time it saves: its saves carry no epoch (or the old one) and are refused."""
import hashlib
import json
import os
import re
import time
from .util import read_bytes, read_text, write_text

MAX_USER_BYTES = 16 * 1024 * 1024
SAVED_ID = re.compile(r"[0-9a-f]{16}")


class UserStore:
    def __init__(self, data_dir: str):
        self.dir = data_dir; self.user_path = os.path.join(data_dir, "user.json"); self.saved_dir = os.path.join(data_dir, "saved")
        os.makedirs(data_dir, exist_ok=True)
        epoch_path = os.path.join(data_dir, "epoch")
        if not os.path.exists(epoch_path) or not os.path.exists(self.user_path): write_text(epoch_path, os.urandom(8).hex())
        self.epoch = read_text(epoch_path).strip()

    # --- user.json
    def read(self) -> bytes:
        return read_bytes(self.user_path) if os.path.exists(self.user_path) else b"{}"

    def write(self, body: bytes):
        """Raises ValueError("not JSON") or ValueError("too large")."""
        if len(body) > MAX_USER_BYTES: raise ValueError("too large")
        try: json.loads(body)
        except ValueError as e: raise ValueError("not JSON") from e
        _atomic_write(self.user_path, body)

    # --- saved pictures (copies of the pixels: another model draws the same cell differently)
    def save_picture(self, jpg: bytes, tag: str) -> str:
        sid = hashlib.sha1(f"{tag}:{time.time()}".encode()).hexdigest()[:16]
        os.makedirs(self.saved_dir, exist_ok=True); _atomic_write(os.path.join(self.saved_dir, sid + ".jpg"), jpg)
        return sid

    def picture(self, sid: str):
        p = os.path.join(self.saved_dir, sid + ".jpg")
        return read_bytes(p) if SAVED_ID.fullmatch(sid) and os.path.exists(p) else None

    def remove_picture(self, sid: str):
        """Raises ValueError("bad id")."""
        if not SAVED_ID.fullmatch(sid): raise ValueError("bad id")
        try: os.remove(os.path.join(self.saved_dir, sid + ".jpg"))
        except FileNotFoundError: pass


def _atomic_write(path: str, data: bytes):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f: f.write(data)
    os.replace(tmp, path)
