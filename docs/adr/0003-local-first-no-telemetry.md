# 3. Local first, no telemetry

**Context.** The Android prototype uploaded events to a server for viewer clustering.
**Decision.** In the downloadable app nothing leaves the machine; the preference model and history are local. Clustering and the group prior are dropped from v1.
**Consequences.** No consent flow and no hosting cost; no cross-user learning. Favourites are stored as image files.
