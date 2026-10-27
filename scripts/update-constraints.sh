#!/usr/bin/env bash
# Writes launcher/constraints.txt: the versions of the engine's libraries that engine/uv.lock pins, which the installer applies so a fresh install is the one that was tested
# (and does not break the day diffusers or transformers release a new major version). PyTorch and its CUDA libraries are left out: they come from PyTorch's own index.
# Run it after `uv lock` changes engine/uv.lock.
set -euo pipefail
cd "$(dirname "$0")/../engine"
uv export --frozen --no-hashes --no-emit-project --no-dev | grep -vE '^(torch([=<>~ ;]|$)|nvidia-|triton|cuda-)' | grep -vE '^\s*#' > ../launcher/constraints.txt
echo "launcher/constraints.txt: $(grep -c '==' ../launcher/constraints.txt) pinned"
