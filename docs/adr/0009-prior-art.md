# 0009. The recommender and what it builds on

Status: accepted. This note says which published ideas the recommender uses, and what is, as far as we know, specific to Phosphene. It is not a literature review: we looked for the closest work, we did not search systematically, so "we did not find" is not "it does not exist".

## What is not new (and is cited as such)

- **Learning a taste from choices.** The taste model is a utility function over a map of concepts, fitted from "this one was chosen among these" observations, with a Gaussian posterior (a Laplace approximation). This is preference learning with Gaussian processes (Chu and Ghahramani, *Preference learning with Gaussian processes*, ICML 2005), used interactively with "galleries" of options by Brochu, de Freitas and Ghosh (*Active preference learning with discrete choice data*, NIPS 2007; tutorial: Brochu, Cora and de Freitas, [arXiv:1012.2599](https://arxiv.org/abs/1012.2599)). Our kernel is approximated with random Fourier features (Rahimi and Recht, 2007) so that it is cheap in the browser.
- **Thompson sampling.** The next pictures follow one utility function drawn from the posterior, which explores and exploits at once (Chapelle and Li, *An empirical evaluation of Thompson sampling*, NIPS 2011).
- **Following a taste that changes.** Only the last 120 signals are kept, and older ones count less: a sliding window, as in sliding-window Thompson sampling for non-stationary bandits (Trovò, Paladino, Restelli and Gatti, [JAIR 2020](https://jair.org/index.php/jair/article/view/11407)).
- **Recommending generated content.** Producing the item instead of retrieving it, with a loop between a generator and the person, is proposed in *Generative Recommendation: Towards Next-generation Recommender Paradigm* (Wang et al., [arXiv:2304.03516](https://arxiv.org/abs/2304.03516)), which relies on explicit instructions from the person. *Personalized Image Generation for Recommendations Beyond Catalogs* (Patron, Xu, Kapnadak and Polo, [arXiv:2502.18477](https://arxiv.org/abs/2502.18477), 2025) personalises a diffusion model from implicit feedback (likes, ratings, clicks) without instructions.

## What is specific to Phosphene, as far as we know

1. **The generator is steered through the seed, with no training.** What a picture asks for (its kind of concept, up to two "looks") is written in the 31 bits of its seed; the engine turns it into a prompt. The model of taste picks the seed by Thompson sampling, so personalisation needs no fine-tuning, no paired data and no language model.
2. **A closed loop with a reader of pictures.** A small model (CLIP) says what a picture really shows, and the recommender learns from that, not from what was asked for. A look that is stronger on the pictures a person liked than on others of the same category (the category is controlled for, or a forest lover "likes green") is added to the list of attributes.
3. **Everything on the person's computer**: the generation, the reading, the learning and the data.
4. **Taste islands** (a plausible taste drawn by Thompson sampling decides which concept a new cell shows, anywhere on the map) mixed with a local flow, to find a taste that was never stated and that crosses categories.

We do not claim a new learning algorithm: the parts are standard. The combination, with this way of controlling a generator, is what we have not found published. If you know of closer work, please open an issue.

## How it is checked

`web/tools/` has simulators: a person who likes a theme across several categories without having said so (`simulate-discover.js`), one who likes some kinds inside a category (`simulate-facets.js`), one who likes a few concepts (`simulate.js`). They show whether a change helps, not whether real people like the result.
