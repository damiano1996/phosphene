# 4. Apache-2.0 for the code, models kept separate

**Decision.** Code under Apache-2.0: permissive, with an explicit patent grant, and consistent with the libraries it builds on (diffusers, transformers, htm). Models are never redistributed; they are fetched from their source and keep their licences.
**History.** The project began under AGPL-3.0-or-later, to keep improvements open even in a hosted service. For a local application that protection matters little and the licence keeps companies and contributors away, so it was changed before the first public release (the author held all the copyright).
**Consequences.** The pictures a model draws are subject to that model's terms, which the app shows on each model's card; some restrict commercial use.
