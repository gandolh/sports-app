# Task 24 — Schema v4: logging, dates, and the stop rule

## Context

The 2026-09-04 direction round reversed three locked decisions (see
`corpus/wiki/reversals.md`). This brief lands the **contract half** of that
reversal: the types and the content. It touches no persistence and no UI.

**Read first:** `corpus/CLAUDE.md` invariants — they were rewritten on 2026-09-04 and
the governing one is now *"the prescription never adapts to what you logged"*, not
*"the app measures nothing"*. The direction of causation is the whole invariant.

## What you own

```
shared/types.ts                              schemaVersion 4, logging types
client/src/domain/types.ts                   Rung.stopRule
client/src/domain/ladders.ts                 migrate 35 rungs
client/src/domain/__tests__/ladders.test.ts  adapt
client/src/domain/__tests__/types.test.ts    adapt
client/src/domain/__tests__/schedule.test.ts ADD the causation guard
client/src/domain/__tests__/fixtures.ts      adapt
```

**Do NOT touch** `client/src/persistence/**` (brief 25), `client/src/ui/**` (briefs 26
and 27), `server/**` (brief 25), or `client/src/domain/schedule.ts` itself beyond what
the guard test needs — `prescribe` must come out of this brief byte-identical.

## 1. `Rung.stopRule`

Every rung's **fourth cue is already a stop rule** and has been since brief 03:

- `push-04-full` — "Stop the set when your hips sag, your head pokes forward…"
- `core-02-plank` — "Stop the clock when your hips sag toward the floor or ride up…"
- `pull-01-prone-y` — "Stop the clock when your shoulders creep toward your ears…"

It is the one line that tells the user when to end a set, in an app whose premise is
that the user autoregulates, and it currently renders as item four of four, below the
fold. Open question 9.

Add `readonly stopRule: string` to `Rung` — **required, not optional**, for the same
reason `Ladder.kind` is required: a rung shipped without a stop rule is a safety gap,
and optional means it will be forgotten. Move each rung's last cue verbatim into it and
delete it from `cues`.

**Verbatim.** Do not rewrite, shorten or normalise the wording. If a rung's last cue is
*not* a stop rule, do not invent one — report it and stop.

Update `ladders.test.ts`'s cue-count assertions and add: every rung has a non-empty
`stopRule`, and no `stopRule` is duplicated across rungs whose movements differ (a
copy-paste guard, not a style rule).

## 2. Schema v4

```ts
export const CURRENT_SCHEMA_VERSION = 4
export interface StateDoc { readonly schemaVersion: 4; … }
```

`ExerciseRecord` gains one optional field:

```ts
/**
 * What the user actually did, per set, when they chose to say. Length ≤ `sets`.
 * ABSENT is the normal case and means "not logged", never "did nothing".
 *
 * Nothing reads this back into the prescription — see the causation guard in
 * schedule.test.ts. It exists to be shown to the person, not to the engine.
 */
readonly logged?: readonly number[]
```

`SessionResult.completedAt`'s docstring currently says *"NOTHING in client/src/ui may
read it"*. That is now false — rewrite it: the UI reads it for the calendar, the streak
and the "last time" comparison, and `client/src/domain/` still may not read the clock.

Keep `sets` a count. Keep `targetValue` "what was prescribed, never what was achieved" —
`logged` is the achieved half and they are deliberately separate fields.

## 3. The causation guard — the most important thing in this brief

A new test in `schedule.test.ts`, named so it cannot be deleted casually:

> **Given any StateDoc, adding, changing or removing `logged` anywhere in `history`
> does not change the output of `prescribe()` for any variant.**

Build it by taking a document with history, deep-cloning it, writing arbitrary `logged`
arrays throughout the clone, and asserting `prescribe(original, v)` deep-equals
`prescribe(clone, v)` for all three variants. Property-style over several shapes beats
one example.

This is the test that stops the reversal from quietly becoming adaptation. Write it
before you write the types if you like — it should pass trivially today, and that is
the point: it will only ever fail on the day someone wires a log into the engine.

## Acceptance

- `npm run typecheck && npm run lint && npm test` green from the repo root.
- All 35 rungs carry a verbatim `stopRule`; `cues` are one shorter each.
- `CURRENT_SCHEMA_VERSION === 4`.
- The causation guard exists and passes.
- `prescribe`, `recordSession`, `toSessionResult` are unchanged in behaviour — the
  existing `schedule.test.ts` assertions all still pass untouched.

## Out of scope

The v3→v4 document migration (brief 25). Any UI. Any server change.
