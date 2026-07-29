---
summary: Locked stack, storage, routing, timer and rendering choices — read before proposing an alternative implementation.
updated: 2026-07-29
---

# Technical decisions

Settled implementation calls, split out of [decisions.md](decisions.md) when that page
passed the 200-line cap. Product and programme decisions live there; this page is how
the thing is built. **Do not relitigate these** without an explicit revisit plus a
[`../log.md`](../log.md) entry.

### PWA — Vite + React + TypeScript
Installs to the home screen, offline via service worker, static deploy, one codebase
for phone and desktop, no app store, no signing certs, no native build pipeline.

**TypeScript is pinned at 6.0.3, not 7.** `typescript-eslint@8.65.0` peer-requires
`<6.1.0`, and the import-boundary rule is the entire reason ESLint is in this project —
so the linter wins over the newer compiler. All dependencies are exactly pinned
(`save-exact=true`).

### TanStack Router + Query, Base UI, and react-hook-form
Four routes with typed params and a document that must stay fresh across them justify a
router and a cache rather than hand-rolled state. **Base UI is `@base-ui/react`** — not
`@base-ui-components/react`, which is stuck at an ancient release candidate. Use it
wherever it fits; the design system in [design-system.md](design-system.md) is what it
gets styled into.

**Forms use `react-hook-form`** (user's call, 2026-07-29). There are only two — the login
screen and the sync settings — which is a thin case for a dependency, but hand-rolled
validation state is exactly the code that rots, and the alternative is the same logic
written twice. Validate **on blur and submit, never per keystroke**.

The validation rules themselves are **not the form layer's to define**: the username rule
lives in `shared/username.ts` (`USERNAME_PATTERN`, `USERNAME_RULE`, `isValidUsername`) —
one definition imported by the client *and* the service, since brief 21. A form that
restates the rule is a second source of truth for it. **The password field has no
validation**, which is the honest reflection of nothing checking it.

### `vite.config.ts` must import `defineConfig` from `vitest/config`
Importing it from `vite` makes the `test` block fail typecheck (TS2769). Cheap to get
wrong, and the error message does not point at the cause.

### A single hand-editable JSON document per user as the source of truth
Deliberately not an opaque DB. When the schedule puts you on a rung that feels wrong,
you open the file and fix it instead of building an admin UI. Every field must be
self-explanatory to someone fixing a wrong rung at 2am — hence `sessionsDone`, not
`sd`; readable string discriminants, not numeric enums.

v2 made this far safer: **the document holds one integer per pattern and nothing
derived**, so a hand-edit cannot produce a state that disagrees with itself. See
[progression-engine.md](progression-engine.md#state-is-one-integer-per-pattern).

### Three npm workspaces: `client` · `server` · `shared`
*Decided 2026-07-29 by the user, replacing a single-package layout.*

`shared/` owns **the wire contract and the document shape** — nothing else. It is the fix
for a duplication the build already had to paper over: the username rule existed in both
`server/db.mjs` and the client codec, kept honest by a test that asserted the two regexes
matched. One definition, imported by both, is strictly better than two definitions plus a
test.

`shared/` must stay **runtime-agnostic** — no `node:` imports, no DOM — because both a
browser bundle and a Node service import it. That is the constraint that decides what is
allowed in: data shapes and validation, never behaviour. The ladders, the schedule and the
milestones stay in the client; they are logic the server has no business knowing.

### The API is Fastify, and the REST contract is unchanged
*Decided 2026-07-29 by the user, **reversing the zero-dependency decision below.***

The endpoints, their paths, their status codes and their bodies stay exactly as brief 17
landed them — the client already speaks plain REST and does not change. What changes is
the implementation underneath: routing, body limits, content-type handling and error
shaping stop being hand-rolled, and validation becomes schema-driven so the same schema
that guards the server also types the client.

**What this costs, stated plainly rather than discovered later:** the service gains a
dependency tree, so deploying stops being a file copy and gains an install step on the
server. That was the actual value of the zero-dependency choice — not code aesthetics.
The 73 existing server tests are the contract that makes the migration verifiable instead
of hopeful, and they must keep passing against the new implementation.

### SUPERSEDED — the service was zero-dependency
Until 2026-07-29 the service used only `node:sqlite`, `node:http` and `node:crypto`, and
the ESLint config declared Node globals by hand rather than pulling in a `globals` package
specifically to preserve that. Recorded because it explains why several things are shaped
oddly, and because the deploy consequence above is the reason it was worth having.

### Durability: SQLite holding JSON snapshot rows, one stream per user
*Revisited 2026-07-29 — supersedes both an earlier plan to `PUT`/`GET` a single remote
JSON file, and v1's "no users table".*

The service owns `db/app.db` (gitignored) via Node's built-in `node:sqlite`, and the
client `PUT`s/`GET`s a JSON document against it. **Snapshot rows are keyed by username**,
so each user has an independent append-only stream. Local-first, last-write-wins per user
— correct here because a user trains on one device at a time. `node:sqlite` stays: it is
built in, and nothing about the Fastify migration touches the storage layer.

**Stored as snapshot rows, not normalised tables.** The codec already owns validation
and the canonical shape, and `schemaVersion` lives inside the JSON — normalising into
`sessions`/`sets` would create a second source of truth for shape and duplicate all
that validation. Snapshot rows also give free version history, and the JSON stays
extractable with one `sqlite3` query.

**Retention is small on purpose: ~20 per user.** Each snapshot embeds the full history,
so snapshot size grows linearly with sessions and total database size grows
*quadratically* with retention × sessions. Prune by `id`, never by `created_at` — NTP
can move a clock backwards.

Browser storage is **not** durable: iOS evicts IndexedDB under pressure and one "clear
site data" wipes everything. Losing history means losing ladder position entirely.

### Authentication is a nameplate, not a boundary
Username identifies a state document; the password is accepted and **discarded in the
request handler** — never stored, never compared. Storing an unchecked password buys
nothing and collects real passwords people reuse elsewhere. `/login` must work offline,
which it trivially does because there is nothing to verify.

Constant-time comparison still applies to the deployment's own shared secret, where one
exists: `timingSafeEqual` over SHA-256 digests, which is constant-time even for
wrong-length input.

### Timestamp-based countdown, and a wake lock
A hold's countdown is computed from a stored start time; `setInterval` continuity is
never trusted. `navigator.wakeLock` is held for the duration of an active session so
the screen does not sleep mid-set.

**v2 downgraded this from a correctness requirement to a convenience.** The countdown is
orientative and gates nothing — Next is always live — so a wake lock failure or a
backgrounded tab costs the user a glance, not a broken session. There is no rest timer
at all, because a rest timer would be the app measuring something.

### Figures: five poses, animated on a data-driven clock
Five SVG poses (push · squat · hinge · prone · plank) on a fixed 200×200 grid, single
stroke weight, no shading, no faces, one accent colour. `stroke="currentColor"` gives
dark mode free.

**Each rung's `modifier` data drives the animation timing**, so one drawing produces 35
visibly distinct results: a 3-second lowering genuinely takes three seconds, a
2-second bottom hold visibly stops. That is what closed the rung-discriminability
question — five drawings, one animation driver, not 35 hand-authored animations. Must
respect `prefers-reduced-motion` by falling back to the static end pose.

**Hard rule:** the app is built entirely against labelled placeholder boxes. Drawing is
never on the critical path.

### SUPERSEDED in v2 — charts, and audio cues
- **Charts are gone.** A fixed schedule plotted against session number is a straight
  line containing no information. The v1 rule ("never plot raw reps, plot a monotonic
  index") was correct for an adaptive engine and is now moot.
- **Audio cues are out of v2 scope.** They existed to announce rest-timer transitions,
  and there is no rest timer. `speechSynthesis` plus a WebAudio beep remains the right
  implementation if a hold-countdown chime is ever wanted.

### No code graph for now
Greenfield single package; `grep` over a small `client/src/` is cheaper than maintaining an
index. Revisit past ~50 files. See [`../routing.md`](../routing.md).
