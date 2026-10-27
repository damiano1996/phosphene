#!/usr/bin/env bash
# Starts the engine, which serves the web client, and opens it in the browser.
#   first time:   (cd engine && uv sync)
#   then:         scripts/web.sh [--no-open] [--data-dir DIR]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x engine/.venv/bin/python ] || { echo "engine environment missing: run  (cd engine && uv sync)"; exit 1; }
cd engine
exec .venv/bin/python -m phosphene_engine --web --atlas-dir ../atlas "$@"
