# 1. A UI and a Python engine in two processes

Status: accepted. The UI is the web page ([0006](0006-browser-client.md)).

**Context.** The best image runtimes live in Python; the interface should not depend on them.
**Decision.** Keep them separate, joined by a small localhost HTTP API with a secret token. The UI starts and stops the engine.
**Consequences.** Models can change without touching the UI, and the UI is testable without a GPU. Cost: a local port, a startup wait, a packaging step for Python.
