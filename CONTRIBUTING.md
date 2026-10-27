# Contributing

Thank you for looking. Phosphene is a small project with a clear shape; a change that fits it is easy to merge.

## Before you start

- **Open an issue first** for anything bigger than a fix (a new feature, a change to how the recommender behaves, a new model backend): it saves you from building what we would decline. For a model
  or a looks list, a pull request with the data is fine.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (ten minutes) and the decisions in [docs/adr/](docs/adr/). The two-process design, local-first and no telemetry are decisions, not accidents.
- **Be kind.** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies.

## Set up

```bash
(cd engine && UV_HTTP_TIMEOUT=1200 uv sync --extra dev)     # the engine, with pytest and ruff
scripts/check.sh                                            # lint and every test that needs no GPU
scripts/web.sh --data-dir /tmp/phosphene-dev --port 8790    # a throwaway profile on another port, to try things in a browser
```

Node.js 18+ runs the page's tests and lint (`web/`; nothing to install: there are no dependencies, and ESLint is fetched by `npx eslint@9`: version 9, because 10 needs a newer Node).

## What a good change looks like

- **It does one thing**, with a commit message that says why. Behaviour changes and refactors are separate commits (a refactor must not move a number: run the simulators before and after; they are
  deterministic).
- **It has a test**, if it can: pure logic in `web/js/core` and everything in `engine/src/phosphene_engine/api.py` can be tested without a browser or a GPU. A change to the recommender comes with the
  output of `web/tools/simulate-*.js` before and after.
- **It was seen working.** Tests do not reach the canvas or a model. Run the app on a throwaway profile, do what you changed, and say in the pull request what you saw (and on which GPU and model).
  `scripts/smoke-engine.sh` and `scripts/smoke-browser.py` do the common walk.
- **It matches the code around it**: naming, comment density (a comment says why, not what), the dense style of the files. `scripts/check.sh` must pass.
- **It keeps the promises**: nothing leaves the machine; the server stays on 127.0.0.1 behind its key; the person's data stays in one folder they can read, export and delete.
- **Content is data.** New concepts, kinds and looks go in `atlas/` (see [docs/EXTENDING.md](docs/EXTENDING.md)); the first thing a person sees is made of them, so check the pictures.

## Licence

By contributing you agree that your contribution is licensed under the Apache-2.0, like the rest. Do not add code or data you cannot license that way. Models, and the pictures they make,
keep their own licences and are never added to the repository.
