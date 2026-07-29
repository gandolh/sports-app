# Task 02 — Domain types & the state document

## Context

This brief writes **the contract every later brief codes against**, so it is worth
more care than its size suggests. Briefs 03, 04, 05, 09 and 11 all consume these
types; getting a field wrong here means touching five briefs later.

Read [`SPEC.md`](../../../SPEC.md) and
[progression-engine.md](../../wiki/progression-engine.md) before starting — the
engine's rules dictate what state must be recorded.

The state document is the app's **source of truth and its backup format at the same
time**: one human-readable, hand-editable JSON file. That dual role is a locked
decision ([decisions.md](../../wiki/decisions.md)) and it constrains the design —
field names must be self-explanatory to a human opening the file in an editor at
2am to fix a wrong rung. Prefer `rungIndex` over `ri`, and prefer a readable
discriminant string over a numeric enum.

## Files you OWN

```
src/domain/types.ts
src/domain/__tests__/types.test.ts     (type-level + fixture sanity tests)
```

## Files you must NOT touch

Everything else. No ladder content (brief 03), no engine logic (brief 04), no
storage code (brief 05).

## What to do

Define the types below. Names are suggestions; the *shape* is the contract.

1. **`Pattern`** — `'push' | 'squat' | 'hinge' | 'core' | 'pull'`.
2. **`TargetUnit`** — `'reps' | 'seconds'`. Core and pull are time-based and run the
   identical progression rules with seconds substituted for reps.
3. **`Rung`** — one movement plus a modifier: a stable `id`, a display `name`, the
   `cues` (an ordered list of short form cues — see the cue-quality risk in
   [open-questions.md](../../wiki/open-questions.md)), an optional `figureId`, and
   the tempo/pause metadata that distinguishes it from its neighbours.
4. **`Ladder`** — a `Pattern`, its `unit`, its ordered `rungs`, and its
   `targetMin`/`targetMax` (5–12 reps, or 20–45 seconds).
5. **`CycleDay`** — `'A' | 'B' | 'C'` plus the patterns each day trains.
6. **`SetResult`** — `targetValue`, `actualValue`. One per set.
7. **`Effort`** — `'easy' | 'ok' | 'hard'`, captured on the **last set only** of
   each exercise.
8. **`ExerciseResult`** — the `Pattern`, the `rungId` performed, the `SetResult[]`,
   and the `Effort`.
9. **`SessionResult`** — a `completedAt` ISO timestamp (**supplied by the caller**,
   never read from the clock inside `domain/`), the `CycleDay`, and the
   `ExerciseResult[]`.
10. **`LadderState`** — per pattern: `rungIndex`, current `target`, and the counters
    the engine's rules need: consecutive clean sessions at the top target, and
    consecutive missed sessions. Derive what you can rather than storing it, but
    **store what would otherwise require replaying all history** — see the
    invariant note below.
11. **`StateDoc`** — `schemaVersion` (a number, starting at 1),
    `sessionsCompleted` (monotonic, never resets), `cyclePosition` (an integer
    counter — **not a date**), `ladders: Record<Pattern, LadderState>`, and
    `history: SessionResult[]`.

**One design question you must resolve and record in the file's header comment:**
is `LadderState` *authoritative*, or is it a *cache* derivable by folding
`history`? Recommendation: make it derivable and add a
`deriveLadderStates(history)` contract in brief 04, while still persisting it. That
way a hand-edit to fix a wrong rung takes effect immediately, and a corrupted
counter is repairable by replay. State the choice explicitly — brief 04 depends on
which it is.

Add `schemaVersion` from day one even though there is only one version. Retrofitting
migration onto a file that already holds six months of real training history is
the kind of problem you only get to have once.

## Acceptance

- `npm run typecheck` passes with strict mode.
- A committed fixture `StateDoc` representing a mid-program user (several sessions
  of history, ladders at differing rungs) parses and typechecks. Later briefs will
  reuse this fixture, so make it realistic, not minimal.
- Nothing in `src/domain/` imports a browser API or reads the clock; the layer
  check from brief 01 passes.
- The header comment records the authoritative-vs-derived decision.

---

## Outcome — 2026-07-29

Shipped. `npm run typecheck`, `npm run lint`, and 14 tests pass.

**The authoritative-vs-derived question is RESOLVED as: authoritative on read,
derivable for repair.** Recorded in the header comment of `src/domain/types.ts`.
The engine and UI always read `ladders` directly; `deriveLadderStates(history)`
exists as an *explicitly invoked* repair tool and must never run automatically.
Both halves are required and they conflict if derivation is implicit — a
hand-edited `rungIndex` must take effect immediately, but a corrupted counter must
be recoverable without discarding history. **Brief 04 must not consult `history`
inside `applySession`.**

**Three additions beyond the brief, each to prevent a later brief editing this file
(which they are all forbidden from doing):**

1. `Settings` / `SyncSettings` on `StateDoc`. Briefs 05, 07, 08 and 11 each need a
   settings slot; without this, all four would need to touch `types.ts`.
2. `Ladder.kind: 'strength' | 'postural'` is **required, not optional**. The pull
   ladder trains no pulling strength in v1, and the UI must say so — a required
   discriminant cannot be forgotten, an optional flag can. This is a safety
   misrepresentation risk, so the type enforces it.
3. `Modifier.pauseAt` (`'bottom' | 'top' | 'mid'`). "Pause 2s" is ambiguous and
   possibly unsafe; the type makes the location mandatory to express.

`RungId` is the template type `` `${Pattern}-${string}` ``, so a rung id must carry
its pattern prefix. Rung ids are written into persisted history and are therefore
**immutable once shipped** — renaming one orphans real training records.

`cycleDayAt()` handles negative and out-of-range positions by positive modulo
rather than throwing, because a hand-edited state file is an expected input.

**Fixture:** `src/domain/__tests__/fixtures.ts` exports `midProgram` — nine
sessions across three full cycle turns, ladders at five different rungs, with a
real push-ladder rung advance embedded (targets 10 → 11 → 12, then reset to 5).
That advance is the transition a raw-reps chart renders as a regression, so briefs
04, 05 and 09 all have something meaningful to test against.

**⚠ Handoff to brief 03:** the fixture's `RungId`s (`push-03-knees`,
`squat-02-bodyweight`, `hinge-01-glute-bridge`, `core-02-plank`, `pull-01-prone-y`,
`pull-02-prone-t`) predate `ladders.ts`. Brief 03 must either adopt these ids or
update the fixture, and brief 04 should then add a test asserting every fixture
rung id exists in `LADDERS`.
