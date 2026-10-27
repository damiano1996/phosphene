# Architecture

Phosphene is two programs that talk over localhost: a **page** (the interface and the recommender) and an **engine** (the models). The page is served by the engine, so starting the engine is
all there is to install.

```
 browser  ── HTTP, 127.0.0.1, key ──▶  engine (Python)
 web/                                   engine/src/phosphene_engine
  js/core   pure logic, tested           api.py        the HTTP API, as functions of a request
  js/app    screens, canvas, input       security.py   host, origin and key checks
                                         render_queue  batches and caches the pictures
 atlas/  the content both read           manager.py    the loaded model; catalog.py, downloads.py, readers.py
                                         backends/     one class per kind of image model
```

Why two: the best image runtimes live in Python and need the GPU; the interface should be testable without one, in a real browser, on any system ([ADR 0001](adr/0001-two-processes.md),
[0006](adr/0006-browser-client.md)).

## The page (`web/`)

Plain ES modules with JSDoc types, no build step; Preact + htm (one vendored file) for the screens, a canvas for the mosaic.

- **`js/core`** has no DOM and no network, and all of it has tests (`web/test`):
  - `spiral.js` the world: an endless Vogel spiral of cells, made lazily and only next to existing cells; a cell never changes. What a cell is: a point of the concept map (`z`) and a seed.
  - `preference.js` the taste model: utility(z) = w · φ(z) with random Fourier features (a Gaussian process); fitted from observations ("this one was chosen among these") with a Laplace
    approximation, over a sliding window of recent signals; sampled by Thompson sampling.
  - `facets.js`, `discover.js` finer kinds and looks (below); `learned.js`, `tree.js` what the model has learned, as numbers a screen can show.
  - `lens.js`, `voronoi.js`, `framing.js`, `poly.js` the geometry of the mosaic. `tuning.js` every number that tunes the feel and the recommender.
- **`js/app`** the browser side: `main.js` (start), `scene.js` (the canvas: frame loop, hit testing), `draw.js` (buttons, badges), `input.js`, `images.js` (the pictures: queue, previews,
  readings), `controller.js` + `models-ui.js` (choosing and loading a model), `settings.js`, `learned.js` + `graph.js` (what it learned), `user.js` (the person's data, saved through the engine).
- `tools/` simulators of a person with a taste, to see what a change to the recommender does ([ADR 0009](adr/0009-prior-art.md)).

## The engine (`engine/`)

- **A picture** is asked for by `GET /img?z=<12 numbers>&seed=<int>&v=<key>`. The engine finds the concept(s) nearest to `z` (two when they are about as close: their prompt embeddings are blended),
  makes the prompt of the seed's style, kind and looks, and draws it. Pictures are cached on disk by their exact request, so asking again is instant, now or after a restart.
- **The version key** `v` names everything that changes the pixels (atlas, model, decoder, settings). A request with another key is refused (409): it is never drawn with something else
  ([ADR 0002](adr/0002-embeddings-and-version-key.md)).
- **Models** are catalogue entries (`catalog.json`); `Catalog` says which are installed, `Downloads` installs and deletes (only what it downloaded itself), `Manager` loads one at a time and goes
  back to the previous one if a switch fails ([ADR 0005](adr/0005-model-manager.md)). A **backend** (`backends/`) turns prompt embeddings and seeds into images; backends are registered by name
  and imported only when used.
- **The reader of pictures** (`readers.py`, `captioner.py`) is optional: it scores each picture against the engine's attributes and a lexicon of looks.
- **State** lives in one folder (see [CONFIGURATION.md](CONFIGURATION.md)): the person's file, saved pictures, the cache, the attribute registry. Nothing else is written.

## The seed

A seed is 31 bits and carries more than noise. The layout is written once, in `engine/src/phosphene_engine/atlas.py` and `web/js/core/facets.js` (and tested on both sides):

| bits | what |
|---|---|
| 0–2 | which of 8 slots of the style table (photo, close-up photo, painting) |
| 6–7 | the **kind** of the concept: 0 the plain concept, 1–3 a finer kind (`atlas/facets.json`) |
| 8–16, 17–25 | up to two **looks** asked for (an id of the engine's registry, plus one; 0 for none) |
| the rest | noise: every bit also goes into the random generator |

Personalisation therefore needs no training: the recommender picks seeds; the engine turns them into prompts (only models that keep their text encoder can make a prompt on demand: SD-Turbo and
SD 1.5 + LCM so far; the others draw the concept and its kind). The reader says what a picture really shows, the model learns from that, and a look that is stronger on liked pictures than on others of
the same category is added to the registry, where it can be asked for like the others.

## Security in one paragraph

The server binds to 127.0.0.1, serves only its own host names (against DNS rebinding), needs a key (in the address, then in an HttpOnly SameSite=Strict cookie) for everything but `/health`, requires
an own `Origin` for anything that changes state, has no CORS, serves only known file types from the page's folder, and refuses a save from a page that predates a reset of the data. [SECURITY.md](../SECURITY.md).
