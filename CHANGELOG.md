# Changelog

All notable changes. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); there is no numbered release yet.

## Unreleased

First public state of the project.

### The mosaic and the recommender
- An endless mosaic of pictures drawn on the person's GPU, in a browser; drag, go to a picture, see it large, heart it, cross it out, download it.
- A taste model (Gaussian-process preference model, Thompson sampling, a sliding window of signals) that finds a taste across categories nobody named; finer kinds of a concept and looks, written in the
  seed of each picture; an optional reader of pictures that closes the loop and discovers new looks.
- "What it learned": a zoomable map of the taste, the looks favoured, every signal; pause, export, forget.

### The engine
- Models from a catalogue (SD-Turbo, SD 1.5 + LCM, SDXS, SDXL-Turbo, RealVisXL, DreamShaper XL, SANA Sprint, FLUX.1 schnell) with download, delete and tuning; a failed switch goes back to the previous model.
- The HTTP API as testable functions, with host, origin and key checks; backends registered by name.
- Tests that need no GPU (`engine/tests`, `web/test`), simulators of a person with a taste (`web/tools`), smoke tests (`scripts/`), CI.

### Installers
- A launcher app (published for Linux as `.AppImage` and `.deb`; the Windows and macOS builds exist but wait for code signing) that installs Python, PyTorch and the engine with uv and starts it; the engine runs on NVIDIA (CUDA) and, experimentally, on Apple Silicon (MPS).
