# Task 30 — The account screen's "Total work ever" note is out of date

## Context

`client/src/ui/routes/account.tsx:146` heads a card "Total work ever". The note under it
(lines 153-156) reads:

> This is work the schedule asked for, added up. The app never learns what you actually
> did, so it cannot claim more than that — and it is still the largest true number here.

That was true until 2026-09-04. Since then the app records optional logged sets
(`ExerciseRecord.logged` in `shared/types.ts`, schema v4), so "never learns what you
actually did" is false. The numbers are still the schedule's: `totalWork` in
`client/src/domain/milestones.ts:193` sums `sets × targetValue` and ignores `logged`.

## What to do

Make the copy true, in the screen's existing voice. Two options, owner's call:

1. **Copy only.** Say the totals are what the schedule asked for, and that logged sets
   are shown elsewhere (find where: the player, history, `/progress`) and are not
   counted here. This needs no logic change.
2. **Count logged work where it exists.** `totalWork` would use `logged` for sets that
   have it and the prescription for the rest, and the note would say so. This is a
   display-only change, but it must not let a logged value reach `prescribe()`.
   `corpus/CLAUDE.md` names that the governing invariant. Option 2 needs a grill with
   the owner first, because it changes every total on `/`, `/progress` and `/account`.

Default to option 1 if the owner has not answered.

## Also stale, same cause

Comments that still say "the app measures nothing", found 2026-10-09:
`client/src/ui/routes/account.tsx:36`, `client/src/domain/milestones.ts:179`,
`client/src/ui/components/CountUp.tsx:8`, `client/src/ui/components/Player.tsx:30`,
`client/src/ui/components/StopRule.tsx:15`, `client/src/domain/types.ts:94`. Reword each
to match the 2026-09-04 reversal (see `corpus/wiki/reversals.md`). Comments only.

## Files you OWN

- `client/src/ui/routes/account.tsx` (the copy, and its header comment)
- The comments listed above
- `client/src/ui/__tests__/screens.test.tsx` and `sync.test.tsx` only if they assert the
  old sentence. They currently assert the heading `Total work ever`, so keep that or
  update the tests with it.
- Option 2 only: `client/src/domain/milestones.ts` and its tests

## Must NOT touch

`prescribe()` and anything under `client/src/domain/` other than as option 2 allows.

## Acceptance checks

- `grep -rn "never learns" client/src` returns nothing.
- `/account` shows the new note with a trained fixture. `npm run check` and
  `npm test` pass.
- Option 2 only: a test proves that changing `logged` changes the totals and does not
  change `prescribe()` output for the same `sessionsDone`.

## Out of scope

The heading text, the layout, milestones, and the figures.
