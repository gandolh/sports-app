# Task 03 — Ladder content data

## Context

The five ladders as typed data. This is a **content-authoring brief**, and the
content quality matters more than the code: since a rung is *one movement plus a
modifier*, adjacent rungs often share a shape and differ only in tempo or pause.
A figure cannot distinguish rung 3 from rung 4 — **only the cue text can**.

That makes this the most likely place for the whole engine to be quietly
undermined. If "3s down + 2s pause" doesn't say *where* the pause happens, the user
performs rungs 3 and 4 identically, the engine dutifully advances them, and
progression becomes placebo. This is open question 2 in
[open-questions.md](../../wiki/open-questions.md). Write the cues as if the reader
has never been coached.

The ladders themselves are specified in [`SPEC.md`](../../../SPEC.md) under
*Content*. Reproduce them faithfully; do not invent extra rungs or reorder them.

## Files you OWN

```
src/domain/ladders.ts
src/domain/__tests__/ladders.test.ts
```

## Files you must NOT touch

`src/domain/types.ts` (brief 02 owns it — if a type is genuinely inadequate, note
it in your outcome rather than editing). No engine logic, no UI.

## What to do

1. Author the five ladders from [`SPEC.md`](../../../SPEC.md) as `Ladder` values:
   **push** (9 rungs), **squat** (8), **hinge** (6), **core** (6, time-based),
   **pull** (6, time-based, postural only).
2. Every rung gets **2–4 cues**, each a short imperative sentence. Cues must cover:
   - the **setup** (hand/foot position, what's elevated and by how much),
   - the **movement standard** (range — where the rep starts and ends),
   - the **modifier, unambiguously located in the rep** — "lower for 3 seconds, then
     hold 2 seconds at the bottom with your chest an inch off the floor" beats "3s
     down + 2s pause",
   - the **failure signal** to watch for (the cue that says *stop the set*, e.g.
     "stop when your hips start sagging").
3. Give every rung a **stable `id`** (e.g. `push-04-full`). These ids are written
   into persisted history, so **treating them as immutable from now on** matters:
   renaming one orphans real training records. Note this in a file header comment.
4. Encode `targetMin`/`targetMax` per ladder: 5–12 reps, 20–45 seconds.
5. **The pull ladder must be labelled as postural, not strength.** Carry an explicit
   field or clearly-worded description that the UI can surface. This is a locked
   decision with a safety rationale — see
   [decisions.md](../../wiki/decisions.md#zero-equipment-and-the-pull-gap). Do not
   present it as a pull-strength ladder.
6. The hinge ladder's top rungs use couch-anchored nordic negatives. Cue them
   carefully — an uncontrolled nordic is a genuine hamstring-strain risk, so the
   cues must specify anchoring, the slow eccentric, and bailing onto the hands.
7. Add a `LADDERS: Record<Pattern, Ladder>` export plus a `getRung(pattern, index)`
   helper that fails loudly on an out-of-range index rather than returning
   `undefined`.

## Acceptance

- `npm run typecheck` and `npm test` pass.
- Tests assert: rung ids are globally unique; every ladder's rungs are non-empty;
  every rung has ≥2 cues; `targetMin < targetMax`; ids match a documented pattern.
- A test asserts the pull ladder carries its postural marker — this is a safety
  invariant, so it gets a test, not a comment.
- **Manual review gate:** print the full ladder set as a readable table and read
  rungs 3, 4 and 5 of the squat ladder back to back. If you cannot tell from the
  cues alone what you would do differently between them, the cues have failed and
  the brief is not done.

---

## Outcome — 2026-07-29

Shipped. `src/domain/ladders.ts` + 35 tests. 35 rungs across five ladders, every
rung carrying 4 cues. Id reconciliation: **no conflict** — all six fixture ids landed
at their natural positions and were adopted verbatim, `fixtures.ts` untouched.

**Manual review gate: passes.** Squat rungs 3/4/5 are unambiguously distinguishable
from cues alone — 3 is a 3s lowering with "the bottom is a turnaround, not a hold",
4 adds a still 2s hold at parallel with the explicit tell "if you are not counting a
still two-second hold at the bottom, you are doing rung 3", 5 keeps that clock but
adds heels-elevated depth. The gate found and fixed two real defects: `squat-04` and
`push-06` originally said "same setup as rung N" without restating it, which is
useless on a card showing only one rung.

**Two cue conventions adopted, and they are the substance of this brief:**
1. Every rung states its tempo explicitly, *including* "steady, no pause" — silence
   about tempo is how a modifier leaks into a rung that shouldn't carry it.
2. A cross-reference never replaces an absolute instruction. Each rung restates its
   own setup and tempo in full, then says what changed vs the neighbour.

**Deviation from SPEC, deliberate:** `squat-05` carries rung 4's 3s-down + 2s-hold.
SPEC labels rung 5 only "heels elevated (deeper range)"; read literally as normal
tempo, rung 5 would be *easier* than rung 4 and the ladder would run backwards.
Conversely `push-07` and `squat-06` explicitly drop the tempo modifier, because
feet-elevated-at-3s+2s and split-squat-at-3s+2s are jumps a beginner stalls on.
No rungs added or reordered.

**Convention future briefs must know:** rung id numbers are **1-based**
(`squat-03` is `getRung('squat', 2)`), while `getRung` is 0-based. Asserted in a test.

**Residual weakness flagged for lived experience:** `pull-06` defines itself relative
to the user's own progress ("the hardest end position you have earned on rung 5")
rather than an objective standard. Honest but unverifiable, and therefore the rung
most likely to drift into being identical to rung 5 in practice.

**Two bugs found in brief 02's fixture** (correctly left alone rather than worked
around — see the wave-3 gate note in `../../wiki/status.md`).
