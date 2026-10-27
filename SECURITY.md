# Security

## Reporting a vulnerability

Please report it privately, not in a public issue: use GitHub's "Report a vulnerability" (Security tab) on this repository. Include what you did, what happened, and the version
(`git rev-parse HEAD`). You will get an answer within a week. Fixes are made in private and credited unless you prefer otherwise.

## The threat model

Phosphene is a program you run on your own computer, for yourself. The engine is a local HTTP server; the page runs in your browser.

What we defend against:

- **Another site in your browser reaching the engine.** The server listens on `127.0.0.1` only. A web page can still be made to talk to it (a name of its own pointed at 127.0.0.1: DNS rebinding),
  so only the host names `127.0.0.1`, `localhost` and `::1` are served; anything that changes state must also carry an `Origin` equal to the `Host`; there is no CORS, so no other origin can read an
  answer; and everything but `/health` needs the key.
- **Another program or user on the machine.** The key is random (128 bits), kept in the data folder with mode 600, compared in constant time, and travels in the address once and then in an
  `HttpOnly; SameSite=Strict` cookie. Other users of the machine can reach the port, but not the key.
- **The page being turned against itself.** A Content-Security-Policy (`default-src 'self'`, no inline scripts, no framing); only known file types are served, only from the page's folder, never
  `test/`, `tools/` or `package.json`; saved pictures are addressed by random ids that must match a fixed pattern; the person's file is size-limited and must be JSON.
- **A stale page overwriting your data**: saves carry the identity of the data folder, and a page opened before a reset is refused.
- **Models.** Files are fetched from Hugging Face over HTTPS by name, loaded with `local_files_only`, only `safetensors` weights are accepted for models added from a link (never pickled files),
  and no model code is run from a repository (`trust_remote_code` is never used).

What we do not defend against: someone who can already run code as you, or read your data folder; a model whose own licence or weights you did not check; the content a model draws.
Run it on a machine you trust. Do not expose the port to a network (use `--insecure-no-token` only on a machine nobody else uses).

## What leaves the computer

Only downloads from Hugging Face (models, when you ask), and nothing about you: there is no telemetry, no account and no analytics (see [ADR 0003](docs/adr/0003-local-first-no-telemetry.md)).
