# Task 28 — In-between rungs at the three big steps

## Context

Open question 7, answered by the owner on 2026-10-07: **add intermediate rungs**.

Every rep-based rung shares `REPS_5_12` (`client/src/domain/ladders.ts`), and
`targetAt` interpolates 5 → 12 across a rung's sessions. That assumes rung N+1's
`min` is about as hard as rung N's `max`. At three places it is badly false:

| Pattern | From (at 12 reps) | To (starts at 5) |
|---|---|---|
| push | `push-03-knees` | `push-04-full` |
| hinge | `hinge-04-single-leg-heel-far` | `hinge-05-sliding-leg-curl` |
| squat | `squat-05-heels-elevated` | `squat-06-split` |

The ±2 variant cannot absorb those steps, so the first session of the new rung
is often its hardest, while the app draws a smooth ramp. Rejected by the owner: a
gentler `range` on the rung after each step, and only correcting the wiki's wording.

## The trap: inserting a rung moves people

Position is not stored as a rung. It is `sessionsDone` per pattern, and
`rungIndexAt = startRungIndex + ⌊sessionsDone / sessionsPerRung⌋`. Insert a rung at
index k and everyone whose index was ≥ k silently drops back one exercise, and
anyone exactly at k-1's last sessions is pushed onto the new rung early. So this
brief carries a **schema migration** (v4 → v5), not just content.

## Files you OWN

- `client/src/domain/ladders.ts` (three new rungs, each with `name`, `cues`,
  `stopRule`, `figureId`; `startRungIndex` if it points past an insertion)
- `client/src/domain/milestones.ts` (only if a milestone's meaning shifts)
- `client/src/domain/__tests__/**`
- `client/src/persistence/codec.ts` and its tests: the v4 → v5 step
- `shared/api.ts`, `server/db.mjs`, `server/state-server.mjs` and their tests:
  accept v5, the way brief 25 accepted v4
- The figure poses for the new rungs, if a rung needs a pose the rig doesn't have
- `corpus/wiki/programme.md`, `corpus/wiki/progression-engine.md`,
  `corpus/wiki/open-questions.md`, `corpus/wiki/decisions.md`, `corpus/log.md`

## What to do

1. **Choose the three rungs**, one per step, each sitting between its neighbours in
   difficulty. The corpus invariants bind: **a rung is one movement plus a
   modifier** (tempo, pause, range, leverage, unilateral work), never a new
   exercise; **zero equipment**; a stop rule like every other rung; and cues that
   say what changed from the rung before. Candidates to weigh, not decisions: a
   full push-up lowered slowly with a knees-down press back up (push); the
   bilateral slide over a shortened range (hinge); a split squat with a hand on a
   wall for balance, as `squat-07` already allows a hand (squat). Record why each
   was chosen in `programme.md`.
2. **Migration v4 → v5.** For each pattern with an inserted rung at index k: if the
   stored `sessionsDone` puts the user at rung index ≥ k under the *old* ladder, add
   `sessionsPerRung` so they stay on the same exercise under the new one. Users
   below k are untouched and will meet the new rung in its turn. History needs no
   change: each `ExerciseRecord` (`shared/types.ts`) stores its `rungId`, not an
   index. The prescription stays a pure function of `sessionsDone`; the migration
   edits stored counts once and adds no runtime branch.
   `progress.tsx` plots `sessionsDone` along the whole ladder, so the migrated
   count is what its "today" marker should show; check it with a fixture.
3. Check `startRungIndex` for each pattern still names the same exercise.
4. Ladder tests: rung counts, every rung has a non-empty `stopRule`, ids are unique,
   and the cue-count rule still holds.
5. Corpus: delete question 7 from `open-questions.md`, record the decision with the
   rejected options, and update `programme.md`'s ladder tables.

## Acceptance

- A migration test per pattern: a v4 document on the rung just past each insertion
  loads as v5 on the same exercise; one just before it is unchanged.
- Server and client both accept v5 and reject a v4 document only through the
  migration path, as brief 25 set up.
- `npm test` and typecheck pass.
