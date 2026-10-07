# Milestones after a rung insertion

Captured 2026-10-07, while building brief 28.

`milestonesReached` (`client/src/domain/milestones.ts`) replays `history` and asks
`rungIndexAt` about each pattern's running session count on **today's** ladders. Brief 28
inserted a rung into push, hinge and squat, and the v4 → v5 migration moved affected
`sessionsDone` counters forward by 14. History was not touched, and its session counts
are still the real ones.

So for a document that was past an insertion when it migrated, the replay disagrees with
what the person did. Example: 20 push sessions under v4, 14 on `push-03-knees` and 6 on
`push-04-full`. The replay says the 14th push session reached
`push-03a-3s-down-knee-press`, a rung they never trained, and "Reached the first full
push-up" does not appear until a 28th push session.

Display only. The prescription reads `sessionsDone`, which the migration got right.
Documents below every insertion at migration time, and every new document, are
unaffected.

Options to weigh, not decisions:

- Use each record's `rungId` where the current ladder knows it, and fall back to the
  count for retired or unknown ids. Changes when a milestone fires by one session for
  every document, because a record names the rung trained, not the rung earned.
- Leave it. If no real document was past an insertion when it migrated (push 14, hinge
  42, squat 56 sessions), nobody sees it.
