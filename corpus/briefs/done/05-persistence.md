# Task 05 — Persistence: codec, local store, export/import

## Context

Your training history **is** the app. The engine is a pure function of it, so losing
it doesn't degrade the experience — it resets every ladder to rung 1 and throws away
months of work. And browser storage is genuinely not durable: iOS evicts IndexedDB
under storage pressure and a single "clear site data" wipes everything.

So this brief is a data-safety brief, not a plumbing brief. Read
[decisions.md](../../wiki/decisions.md) on the state document — it is **the source of
truth and the backup format at the same time**, one human-readable hand-editable
JSON file. That dual role is deliberate: when the engine puts you on a wrong rung,
you open the file and fix it instead of building an admin UI.

## Files you OWN

```
src/persistence/codec.ts       parse · serialise · schemaVersion · migrate
src/persistence/store.ts       load · save · persist() request
src/persistence/__tests__/*
src/ui/SettingsScreen.tsx      export / import UI only
```

## Files you must NOT touch

`src/domain/**` (briefs 02–04). No sync — brief 11 owns `sync.ts`. No player UI.

## What to do

1. **`codec.ts`**
   - `serialise(doc): string` — pretty-printed JSON with stable key order. It will be
     read and hand-edited by a human, so formatting is a feature.
   - `parse(text): { ok: true, doc } | { ok: false, error }` — **never throw, never
     return a partially-valid document.** Validate structurally: `schemaVersion`
     present and known, patterns present, rung indices within bounds, `history` an
     array. A hand-edit is expected, so a bad hand-edit must produce a clear message
     rather than a silently broken app.
   - `migrate(doc)` — currently identity for v1. It exists now because retrofitting
     migration onto a file holding six months of real history is a problem you only
     get to have once.
   - `emptyDoc()` — a fresh document with all ladders at rung 0, target = min.
2. **`store.ts`**
   - `load()` / `save(doc)` against `localStorage` under one key. **Use
     `localStorage`, not IndexedDB** — the document is a few hundred KB even after
     years, the API is synchronous and trivially testable, and IndexedDB's
     complexity buys nothing here. Note this reasoning in a header comment so it
     isn't "upgraded" later by reflex.
   - Call `navigator.storage.persist()` once on first load, behind a capability
     check. Record the granted/denied result in the document so it's visible.
   - **Save must be crash-safe.** Write to a shadow key, verify it parses back, then
     promote to the live key. A save interrupted mid-write must never leave the only
     copy of the history truncated.
   - On a failed `parse` of the live key, **do not overwrite it.** Fall back to
     read-only mode, surface the error, and keep the corrupt text intact — it is the
     user's only copy and it is probably hand-repairable.
3. **Export / import in `SettingsScreen.tsx`**
   - Export: download the serialised document as
     `sports-app-<sessionsCompleted>-sessions.json`. Naming it by session count
     rather than a date makes it obvious which of several files is newest.
   - Import: file picker → `parse` → on success show a **confirmation summary**
     (sessions completed, per-ladder rungs) before replacing, because import is
     destructive and a mis-picked file would silently erase progress.
   - Show current storage state: sessions completed, whether persistence was
     granted, last save time.

## Acceptance

- `npm test` passes. Tests cover: round-trip `serialise`/`parse` on brief 02's
  mid-program fixture; `parse` rejecting each malformed case with a useful message
  and no throw; the shadow-key promotion; and that a failed parse of the live key
  leaves the stored text byte-identical.
- Manual: export produces a file that is readable and editable in a text editor;
  hand-editing a `rungIndex` and re-importing takes visible effect.
- Manual: importing a truncated or unrelated JSON file shows an error and leaves
  existing data untouched.
- No `src/domain/` file was modified.

---

## Outcome — 2026-07-29

Shipped. 96 tests in `src/persistence` (codec 52, store 31, SettingsScreen 13).

**Crash-safety is asserted, not argued.** Save order is
serialise → parse the serialised text → refuse if the existing live doc is unreadable
→ write shadow → read shadow back and byte-compare *and* re-parse → promote → verify
→ remove shadow last. Write ordering is checked against an op log, failures are
injected at each of the three keys, and a lying storage layer that truncates on
`setItem` is caught at read-back. The verify-before-promote step is the one that
matters: a `NaN` target or out-of-range rung index passes `setItem` happily and
destroys history.

**The corrupt-file path is verified to write nothing at all.** A realistic hand-edit
slip (stray comma) leaves `storage.ops` asserted **empty** on load, the stored text
byte-identical after three repeated loads and after a refused `save()`, and the
read-only latch cannot be defeated by call order (save refuses even with no prior
load). `allowOverwriteCorrupt: true` is the single explicit escape hatch, used only by
a confirmed import.

**`serialise` is hand-rolled rather than `JSON.stringify(…, 2)`** so the file is
genuinely readable: the "where am I" summary first, unbounded `history` last, one line
per ladder state and set result, key order taken from `PATTERNS` so it is stable
however the document was built. Byte-stable output, which brief 11's round-trip test
depends on.

**Documented deliberate leniency** — history `rungId`s are not checked against current
ladder content (ids are immutable, so an old document must still load),
`sessionsCompleted` is not required to equal `history.length`, `target` is not
range-checked (a hand-raised target is legitimate), and `_`-prefixed keys are allowed
as human notes in a format with no comments. Everything else, including all of
`settings`, is strict.

**Deviation:** `parse`/`emptyDoc` take ladder content as a **parameter** rather than
importing `LADDERS`, so the codec's tests stayed independent of brief 03's concurrent
content churn. `store.ts` is the single place that names `LADDERS`.

`lastSavedAt` lives in a separate advisory `meta` key rather than in the document,
because a synced document must not carry another device's clock. `persistGranted`
stays `null` when the browser has no Storage Manager — "cannot say" and "said no" are
different facts, and writing `false` would suppress a future ask.

**Not verified programmatically, stated plainly:** the real browser download dialog
and iOS Safari's download behaviour, an actual `navigator.storage.persist()` grant,
and real localStorage eviction under pressure.

**One test had to be repaired at the wave-3 gate:** `codec.test.ts`'s `summarise` case
hardcoded fixture values instead of deriving them, so repairing the fixture broke a
test that was really asserting the fixture's contents back to itself. Now derived from
`midProgram` and `PATTERNS`.
