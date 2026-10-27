# phosphene-engine

The local server of [Phosphene](../README.md): it turns a position on the concept map and a seed into a picture, with the model your GPU can run, behind a small HTTP API on 127.0.0.1, and
serves the web page. It is not meant to be used on its own: start everything with `scripts/web.sh` from the repository root.

- Start it, options and environment: [docs/CONFIGURATION.md](../docs/CONFIGURATION.md)
- How it is built: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md); add a model or a backend: [docs/EXTENDING.md](../docs/EXTENDING.md)
- Tests (the API tests need no GPU and no PyTorch): `python -m pytest`; lint: `ruff check .`
