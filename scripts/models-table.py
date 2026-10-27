#!/usr/bin/env python3
"""The README's table of models, made from the catalogue so the numbers are never typed twice.
    scripts/models-table.py            print it
    scripts/models-table.py --write    put it between the <!-- models:start --> and <!-- models:end --> lines of README.md
    scripts/models-table.py --check    exit 1 if README.md is out of date (the engine's tests run this)"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
START, END = "<!-- models:start -->", "<!-- models:end -->"


def gb(mb): return f"{mb / 1024:.1f} GB"


def table():
    rows = ["| Model | Download | GPU memory | Licence |", "|---|---|---|---|"]
    for m in json.loads((ROOT / "engine/src/phosphene_engine/catalog.json").read_text())["models"]:
        if m["backend"] == "captioner" or not m.get("available"): continue            # the readers of pictures are optional extras, listed in the app
        rows.append(f"| **{m['name']}** | {gb(m['size_mb'])} | {gb(m['needs_vram_mb'])} | {m['licence'].split(' (')[0]} |")
    return "\n".join(rows)


def current(readme):
    a, b = readme.index(START) + len(START), readme.index(END)
    return readme[:a] + "\n" + table() + "\n" + readme[b:]


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    path = ROOT / "README.md"
    if mode == "--write": path.write_text(current(path.read_text()))
    elif mode == "--check": sys.exit(0 if current(path.read_text()) == path.read_text() else 1)
    else: print(table())
