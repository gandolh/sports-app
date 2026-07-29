---
summary: Locked stack, storage, timer, audio and rendering choices — read before proposing an alternative implementation.
updated: 2026-07-29
---

# Technical decisions

Settled implementation calls, split out of [decisions.md](decisions.md) when that page
passed the 200-line cap. Product and programme decisions live there; this page is how
the thing is built. **Do not relitigate these** without an explicit revisit plus a
[`../log.md`](../log.md) entry.

### PWA — Vite + React + TypeScript
Installs to the home screen, offline via service worker, static deploy, one
codebase for phone and desktop, no app store, no signing certs, no native build
pipeline. Ten screens with no native API needs beyond a timer and a wake lock.

### A single hand-editable JSON document as the source of truth
Deliberately not an opaque DB. For a single-user app this is strictly better: when
the engine puts you on a rung that feels wrong, you open the file and fix it
instead of building an admin UI.

### Durability: a SQLite service holding JSON snapshot rows
*Revisited 2026-07-29 — supersedes an earlier plan to `PUT`/`GET` a single JSON file
on a remote host. See [`../log.md`](../log.md).*

A small zero-dependency Node service owns `db/app.db` (gitignored) via Node's built-in
`node:sqlite`, and the client `PUT`s/`GET`s the same JSON document against it behind a
shared secret. No users table, no auth flow, no SQL migrations. Local-first,
last-write-wins — correct here because there is exactly one user, so conflicts are
near-impossible. Solves durability and phone↔desktop sync in one move. The same service
and its own database run wherever the app is deployed.

**Stored as append-only snapshot rows, not normalised tables.** The codec already owns
validation and the canonical shape, and `schemaVersion` lives inside the JSON —
normalising into `sessions`/`sets`/`ladders` would create a second source of truth for
shape and duplicate all that validation, for no benefit at one user. Snapshot rows also
give free version history, and the JSON stays extractable with one `sqlite3` query, so
the hand-editability decision above survives.

The trade-off, stated: you lose SQL queryability over individual sessions. That costs
nothing here because the charts screen reads the in-memory document. If it ever matters,
add derived tables *from* the snapshots rather than replacing them.

**Retention is small on purpose.** Each snapshot embeds the full history, so snapshot
size grows linearly with sessions and total database size grows *quadratically* with
retention × sessions. Keep ~20. Raising it to 1000 would be a real problem, not a
tuning knob.

Browser storage is **not** durable: iOS evicts IndexedDB under pressure and one
"clear site data" wipes everything. History loss is not a degraded experience —
the engine loses all knowledge of ladder position and restarts from rung 1.

### Timestamp-based timer plus wake lock
Rest elapsed is computed from a stored start time; `setInterval` continuity is
never trusted. `navigator.wakeLock` is held for the duration of an active session.
A timer that dies on screen lock breaks the guided loop, so this is a correctness
requirement, not polish.

### Audio is `speechSynthesis` plus a WebAudio beep
Both built in, offline, zero assets. The **beep is the fallback** — voice
availability varies across iOS and Android, so nothing may be speech-only.

### Charts are hand-rolled SVG, and never plot raw reps
A few hundred data points do not justify a charting dependency. More importantly,
plotting reps over time in a double-progression system produces a sawtooth that
shows you getting *worse* every time you advance a rung. Plot a monotonic index
instead: `rungIndex × 8 + (reps − 5)`.

### Figures are a rigid system, placeholder-first
Ten SVG pose pairs on a fixed 200×200 grid, single stroke weight, no shading, no
faces, one accent colour. Ten figures drawn to a system read as a design language;
forty freehand sketches read as amateur. `stroke="currentColor"` gives dark mode
free; a CSS crossfade between frames gives a 2-frame animated demo for no extra
assets.

**Hard rule:** the app is built entirely against labelled placeholder boxes.
Drawing is never on the critical path.

### No code graph for now
Greenfield single package; `grep` over a small `src/` is cheaper than maintaining
an index. Revisit past ~50 files. See [`../routing.md`](../routing.md).
