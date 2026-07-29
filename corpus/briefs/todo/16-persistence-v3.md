# Task 16 — Persistence v3: the schema-3 migration and per-user storage

## Context

Brief 15 rewrites the domain to schema **v3**: adaptation is gone, `LadderState` and
`SetResult` are deleted, and the whole mutable state is one integer per pattern. Read
[wiki/progression-engine.md](../../wiki/progression-engine.md#state-is-one-integer-per-pattern)
first — the shape you are persisting is the point of the change, not an incidental
consequence of it.

The app also became **multi-user** (a username, and a password nobody checks), so a
browser now holds one document *per username* rather than one document.

This is the second real migration this codec has had to write, and the first one that
drops a required field rather than an optional one. `MIGRATIONS` already has
`dropEffortFromExercises` at key 1; you are adding key 2.

## Files you OWN

```
src/persistence/codec.ts                  migration v2→v3, validation, emptyDoc
src/persistence/store.ts                  per-username keys
src/persistence/session.ts                NEW — which username this browser is acting as
src/persistence/sync.ts                   send the username with the document
src/persistence/__tests__/codec.test.ts
src/persistence/__tests__/store.test.ts
src/persistence/__tests__/sync.test.ts
```

## Files you must NOT touch

`src/domain/**` (brief 15 owns the contract — if it is wrong, report BLOCKED rather
than editing it), `server/**` (brief 17), `src/ui/**` (briefs 19–20). The two settings
screens under `src/persistence/__tests__/` that render UI
(`settingsScreen.test.tsx`, `syncSettings.test.tsx`) test components brief 19 is
replacing — **delete those two test files** and say so; do not try to keep them green.

## 1. The v2 → v3 migration

A v2 document has, per pattern, `{ rungIndex, target, cleanAtMax, missedStreak }`, and
per exercise an array of `{ targetValue, actualValue }` sets. v3 has one integer per
pattern and a set *count*. The migration is therefore **lossy in one direction and
lossy in the other**, and you must choose deliberately rather than by convenience:

- **`sessionsDone` must be reconstructed, not guessed.** The honest source is the
  history: count the sessions in which each pattern appears. That is exactly what
  `sessionsDone` means, so it is a faithful reconstruction rather than an estimate.
- **Do not try to preserve `rungIndex`.** A v2 rung index was reached by an adaptive
  rule that no longer exists; carrying it over would put the user at a rung the v3
  schedule disagrees with, and the disagreement would be invisible. Reconstructing from
  history is the only self-consistent answer. **Say this in a comment** — the next
  reader will assume dropping `rungIndex` was an oversight.
- **`actualValue` is discarded** and each exercise's `sets` array collapses to its
  length. Assert the collapse rather than assuming every exercise had 3 sets.
- **`variant` did not exist in v2.** Default historical sessions to `'medium'`.
- **`username`** is not in a v2 document. Take it from the migration options, defaulting
  to a documented constant — a v2 document belongs to whoever is loading it, because v2
  had exactly one user.
- **Settings** lose `soundEnabled`, `voiceEnabled` and `skipWarmupByDefault`. Drop them.
- `day: 'A'|'B'|'C'|'D'` on a v2 session becomes `position: number`. The old 7-position
  cycle does not map onto the new 3-position rotation, so **do not invent a mapping** —
  set `position` from the session's index in history modulo 3 and comment that the value
  is only used for display of past sessions, not for any decision.

Keep the existing migration discipline: `migrate` walks versions one step at a time,
never jumps, and a document from a **future** version is rejected rather than coerced.

## 2. Per-username storage

`STORAGE_KEYS` currently names one live key and one shadow key. Make them functions of
the username. Requirements:

- **The crash-safe save sequence is unchanged and must stay unchanged**: serialise →
  parse the serialised text → write shadow → read back and byte-compare *and* re-parse
  → promote to live → verify → remove the shadow last. Do not simplify it while you are
  in there; every step in that order exists because of a specific failure.
- **A corrupt live key still writes nothing and latches read-only.** The latch is now
  **per username** — one user's corrupt document must not lock another user out.
- Usernames go into storage keys, so they must be **sanitised or encoded**. A username
  containing a separator character must not be able to collide with another user's key
  or with the shadow key. Test that adversarially, including empty string and a
  username that is the encoding of another.

`session.ts` owns "which username is this browser acting as": read, write, clear. It is
the only place that answers that question, so `store.ts` takes a username parameter
rather than reaching for it.

## 3. Sync

`sync.push()` / `pull()` send the username alongside the document so the server can key
its snapshot stream. The transport shape is brief 17's call — coordinate by reading
[brief 17](17-multi-user-server.md) and matching it; if the two disagree, brief 17 wins
and you adapt.

Failure stays **non-fatal and fire-and-forget**. Nothing on the session-critical path
may require network.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npx vitest run src/persistence` clean.
- A test migrates a **realistic v2 document with real history** to v3 and asserts every
  reconstructed `sessionsDone` equals the count of that pattern's appearances in
  history. Build the v2 fixture inside the test file — do not depend on the deleted
  `midProgramHistory`.
- A test migrates a **v1** document (which has `effort`) all the way to v3 in one
  `migrate` call, proving the chain still composes.
- A test asserts a v4 document is rejected, not coerced.
- Tests assert the crash-safe sequence's invariants survive: a shadow left behind by a
  crash is recovered, a byte mismatch aborts the promote, and a corrupt live key writes
  nothing.
- A test asserts one username's read-only latch does not affect another's.
- Adversarial key tests: empty username, a username containing the key separator, and a
  username crafted to encode to another user's key.
- **Report the exact set of v2 fields you dropped and why**, so the next migration
  author can see the precedent.
