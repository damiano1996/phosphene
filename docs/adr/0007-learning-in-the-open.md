# 7. What the app learns is a visible, local, sliding window of signals

**Decision.** The recommender (web client, `web/js/core`) learns from the person's signals and shows them everything it learned. There is no server and no telemetry: the data is one
JSON file next to the engine (`user.json`), and Settings has a section, "What it learned", where each signal can be forgotten, learning paused, the data exported or all forgotten.

**Signals** (each logged with type, time, weight, what was shown and how each shown picture looks): a choice (click a cell), a large view (1.5), a save (3; un-saving takes the signal back,
it is not a dislike), "not for me" (a cross beside the heart), and time spent resting on the centre picture or in the large view (only while the camera is still, nothing is open over the
mosaic, the page is visible and someone has touched it in the last 90 s).

**The model.** Still Thompson sampling, now over a *sliding window*: the last 120 signals are kept; inside the window a signal counts for less for every newer one (x0.985) and for less
the older it is (half-life 14 days), so a changed taste takes over and a few odd picks do not overturn an old one. The weights are applied when fitting, to the stored base weight, never in
place. The random features are the same on every launch (`FEATURE_SEED`), so the saved observations mean the same thing next time; what is saved is the observations, never fitted weights.
The fit accepts only steps that improve the penalised likelihood (the diagonal Newton step alone diverged with a full window).

**Beyond what a picture shows.** The same model also learns how pictures look (brightness, contrast, saturation, colourfulness, warmth, hue, detail, symmetry, a subject in the middle,
light at the top, shadows, highlights; measured in the browser on a 48 x 48 copy, only the numbers are kept) and which of the engine's three prompt styles drew them (photo, close-up photo,
painting: known from the seed). The style is steered: a new cell's seed is chosen so that its style follows what was favoured (the engine's own odds are the starting point; a favoured style
becomes more likely, never certain). Colour and composition are learned and shown but cannot be ordered from the engine yet (that would need prompt modifiers and re-encoding).

**Consequences.** The user file grows with the window (about 5 KB per signal, so up to
about 600 KB): the page saves it as an ordinary request (browsers refuse `keepalive` bodies above 64 KiB). Not done yet: image captioning for words about the pictures (see the discussion in the
issue tracker), and showing which signals produced which recommendation.

## Addendum: an optional reader of pictures (words)

A small model can read each finished picture and say what it looks like, so the recommender learns words and not only numbers. It is optional and off by default, listed in Settings >
Pictures with what each one needs, and it runs where there is room: the engine puts it on the graphics card if there is room beside the image model, else on the processor, and the
person can force either. Two kinds (`engine/src/phosphene_engine/captioner.py`, entries with `"kind": "captioner"` in the catalogue, installed and deleted by the same model manager):
- `tags`: CLIP (`laion/CLIP-ViT-B-32`, 0.6 GB) scores every picture against a fixed vocabulary of 37 words about style, light, colour, composition and mood (`atlas/vocab.json`). Measured:
  0.01 s a picture on the graphics card, 0.04 s on the processor, so it can read every picture.
- `caption`: a small vision-language model (SmolVLM 256M / 500M, 0.5 / 1 GB) writes a sentence, and the vocabulary's words are looked for in it. 0.2 s on the card, 1.3 s on the processor,
  so by default it reads only the centre picture.
Only models with `safetensors` weights and no custom code are accepted (Florence-2 needs custom code, so it is not offered). The words are extra features of the same model, saved with the
signals (a vocabulary of another size is tolerated), and "What it learned" shows the words it has learned and the last sentences read. A reader on the card steps aside while an image model
loads and comes back after.
