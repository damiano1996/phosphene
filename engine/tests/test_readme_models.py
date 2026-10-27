"""The table of models in the README comes from the catalogue: if it was edited by hand or the catalogue changed, run scripts/models-table.py --write."""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_readme_table_matches_catalogue():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "models-table.py"), "--check"])
    assert r.returncode == 0, "README.md models table is out of date: run scripts/models-table.py --write"
