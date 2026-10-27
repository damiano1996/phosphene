#!/usr/bin/env bash
# Every check that needs no GPU: lint and tests of the page and of the engine. Run it before a commit.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0; run() { echo "== $*"; "$@" || fail=1; }

run bash -c "cd web && node --test"

if command -v npx >/dev/null; then
  echo "== eslint 9 (web)"
  (cd web && npx --yes eslint@9 . -f json 2>/dev/null) | python3 -c '
import json, sys
n = 0
for f in json.load(sys.stdin):
    for m in f["messages"]: n += 1; print("%s:%s  %s  %s" % (f["filePath"], m["line"], m["ruleId"], m["message"]))
sys.exit(1 if n else 0)' || fail=1
else echo "== npx not found: the lint of the page is skipped (CI runs it)"; fi

if command -v uv >/dev/null && [ -d engine/.venv ]; then
  (cd engine && run uv run --no-sync --with pytest --with ruff ruff check . && run uv run --no-sync --with pytest python -m pytest -q)
else
  echo "== engine: python3 -m pytest (numpy and pytest needed; the tests that need PyTorch are skipped without it)"
  (cd engine && python3 -m pytest -q) || fail=1
fi
[ $fail = 0 ] && echo "all checks passed" || { echo "SOME CHECKS FAILED"; exit 1; }
