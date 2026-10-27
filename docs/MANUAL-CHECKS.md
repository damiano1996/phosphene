# What must work, seen in a browser

Tests do not reach the canvas, a model or a download, so these are checked by looking (`scripts/smoke-engine.sh` and `scripts/smoke-browser.py` walk through the common part). Ticked after it
was seen in Chrome; the lines at the end say what has not been. Run with `scripts/web.sh --data-dir <a fresh folder> --port 8790`, and an isolated `HF_HUB_CACHE` to try a download.

- [x] The page loads from the link with the key; the key is dropped from the address; without it: 403
- [x] First run: choose the model (recommended preselected) -> categories with the download strip -> mosaic
- [x] First run with a real download: progress in the strip, then the preparing steps (isolated HF cache)
- [ ] A failed model goes back to the choice with the reason
- [x] Mosaic draws, 152 cells, 2.3 ms a frame at 3066x1708
- [x] Drag moves the mosaic; a drag ends by gliding onto the nearest cell
- [x] Click a cell: it comes to the centre; click the centre: the large view opens after 400 ms; click again closes it; Esc closes it
- [x] Double click saves (no large view flash); the heart button saves / un-saves; the saved bar shows round thumbnails; its heart opens the gallery
- [x] Heart button saves; saved thumbnail in the bar; gallery grid; large view with Remove
- [x] Saved pictures survive a reload and a restart of the engine
- [x] Settings opens from the sliders icon; sections Model, Pictures, Categories, Sound, Data
- [x] Categories: pick, leave -> "Start a fresh mosaic?" with Start fresh / Later
- [x] Hidden categories never show after "Start fresh"; moving a category between Favourites and Hidden says so
- [x] Model: Use this model returns to the mosaic with the status pill; the old pictures stay until the new model is ready
- [x] Parameters: sliders change nothing until Apply; Apply redraws once; no flash back to the old value; Discard
- [ ] Picture size below the model's minimum is dimmed with the warning; the engine draws at the minimum
- [x] Streaming: steps of the pictures being drawn show in the cells; badge "n/total" by the heart; the raw-noise switch
- [x] Delete a model's files asks first; Forget asks first; Quit asks first and stops the engine
- [x] Add a model from a Hugging Face link: refused with the reason / added
- [ ] Sound: ticks while moving (after the first click); the switch turns it off
- [x] Escape closes the large view, the gallery, the settings
- [ ] No console errors in any of the above

Not seen in a browser yet: a failed model returning to the choice; picture size below a model's minimum (dimmed chips + warning); sound by ear; delete of a model's files; adding a model that
is accepted (only a refusal was tried); the raw-noise switch showing noise. Saved pictures keep their pixels (copied by the engine into `saved/`): checked by hash across a model switch.

Learning (seen in Chrome): signals logged for a choice, a large view, a save, "not for me" and stays; opening Settings adds no stay; the 'What it learned' section shows counts, traits, style odds,
categories, concepts and recent signals; 26 signals and the same taste after a reload; "Forget this" changes the taste; pause records nothing; "Forget everything" asks first and clears.

Reader of pictures (seen in Chrome, isolated cache): Settings > Pictures lists CLIP tags and SmolVLM 256M/500M with what fits here; CLIP on (automatic -> processor, as the card was nearly full):
96 pictures read in 6 s, 17 signals carry the words, 'In words' shows learned words; SmolVLM 256M on: sentences for the centre picture only. Not seen: forcing the graphics card, a reader
stepping aside while an image model loads, the download of a reader from the page (the files were already in the isolated cache), 500M.
