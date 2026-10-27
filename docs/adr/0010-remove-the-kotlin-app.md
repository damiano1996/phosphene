# 10. The Kotlin desktop app is removed

Status: accepted.

**Context.** Phosphene started as a Kotlin/JVM library (`core/`) and a Compose Desktop app (`desktop/`) over the Python engine. The web client ([0006](0006-browser-client.md)) then took
over every feature and went well beyond it (the learning screens, the readers, finer kinds, the map of taste). The Kotlin code had stopped following: its tuning numbers, its model of
taste and its tests described a program that no longer matched the one people use, and two clients of different ages are a trap for contributors and a doubled cost for every change.

**Decision.** Delete `core/`, `desktop/`, the Gradle files and `scripts/dev.sh`. The repository was published with a single commit, so the Kotlin prototype is not in its history; the author keeps a private copy.

**Consequences.** One client, one set of tuning numbers (`web/js/core/tuning.js`). No JVM or Gradle for anyone. The desktop window is gone: the page is opened in the browser, or installed as an
app from the browser (it has a manifest and icons).
