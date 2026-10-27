# 2. Prompt embeddings per model, and a version key that includes the model

**Context.** Blending two concepts mixes prompt embeddings; embeddings belong to one model's text encoder. Images differ by model and by VAE.
**Decision.** Compute embeddings at first run per (atlas version, model) and cache them; send `v=<atlas>.<model>.<vae>` and put it in the image cache key.
**Consequences.** Changing model never serves stale images. First run is slower. Adopting a text-only backend would need a different way to blend.

**Since.** The key grew with the model: `<atlas>.<model>.<decoder>[-f<kinds>v<n>][.a1][-<settings>]`: the table of prompts also depends on the finer kinds of the concepts (`atlas/facets.json`), and `.a1`
says the model makes the prompts of looks on demand. The number of attributes is deliberately *not* in it (every new look would void every picture). See the seed layout in [ARCHITECTURE.md](../ARCHITECTURE.md).
