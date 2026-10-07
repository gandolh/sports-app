/**
 * Shared test fixtures. Deliberately small.
 *
 * The v2 fixture was 21 sessions long because it had to be **replay-verifiable**:
 * `midProgramHistory.reduce(applySession, midProgramStart)` had to equal
 * `midProgram`, since v2 stored accumulated ladder state that could disagree with
 * its own history. That property is gone along with the state it protected — v3
 * stores one integer per pattern and derives everything else, so there is nothing
 * a long history could prove that these five integers do not state outright. The
 * fixture is therefore one document, not a replay, and `midProgramStart` /
 * `midProgramHistory` no longer exist.
 *
 * What it still has to do: give the UI tests a document whose five patterns sit at
 * **different** points, so a screen that renders the same rung for two patterns
 * fails instead of passing by coincidence.
 */
import type { StateDoc } from '@sports-app/shared/types.ts'

/**
 * A document part-way through the programme, chosen so that every pattern is
 * distinguishable from the others:
 *
 *   push   44  →  rung 2 + 3 = 5 (`push-05-full-3s-down`), 2 sessions into it
 *   squat  31  →  rung 1 + 2 = 3 (`squat-04-...`), 3 sessions in
 *   hinge  29  →  rung 1 + 2 = 3 (`hinge-04-single-leg-heel-far`), 1 session in
 *   core   90  →  rung 1 + 2 = 3 (`core-04-hollow-hold`), 6 sessions in
 *   pull   90  →  rung 1 + 2 = 3 (`pull-04-reverse-snow-angel`), 6 sessions in
 *
 * The rotating patterns sit near each other, while core and pull are three times
 * further along because the daily block is trained every session. `cyclePosition`
 * 90 is a Push slot: 90 mod 3 = 0.
 *
 * **Push is 44, not 30, because this is a document the v4 → v5 migration has
 * touched.** It was 30 under schema v4, which put it on `push-05` when the push
 * ladder had no rung 3a. Brief 28 inserted `push-03a` below it, and the migration
 * added one rung's worth of sessions (14) so the same document stays on the same
 * exercise. The codec tests build their v3 and v4 fixtures from this one with
 * push set back to 30, and assert they migrate to exactly this. Hinge (29) and
 * squat (31) sit below their insertions, so the migration left them alone.
 */
export const midProgram: StateDoc = {
  schemaVersion: 5,
  username: 'test',
  cyclePosition: 90,
  sessionsDone: { push: 44, squat: 31, hinge: 29, core: 90, pull: 90 },
  history: [
    {
      completedAt: '2026-05-01T07:12:00.000Z',
      position: 87,
      variant: 'medium',
      exercises: [
        { pattern: 'push', rungId: 'push-05-full-3s-down', sets: 3, targetValue: 8 },
        { pattern: 'core', rungId: 'core-04-hollow-hold', sets: 2, targetValue: 27 },
        { pattern: 'pull', rungId: 'pull-04-reverse-snow-angel', sets: 2, targetValue: 32 },
      ],
    },
    {
      completedAt: '2026-05-02T06:58:00.000Z',
      position: 88,
      variant: 'hard',
      exercises: [
        { pattern: 'squat', rungId: 'squat-04-3s-down-2s-bottom-hold', sets: 3, targetValue: 9 },
        { pattern: 'hinge', rungId: 'hinge-04-single-leg-heel-far', sets: 3, targetValue: 8 },
        { pattern: 'core', rungId: 'core-04-hollow-hold', sets: 2, targetValue: 32 },
        { pattern: 'pull', rungId: 'pull-04-reverse-snow-angel', sets: 2, targetValue: 37 },
      ],
    },
    {
      // A cardio slot. It trains no ladder, so it records only the daily block —
      // two entries rather than none.
      completedAt: '2026-05-03T18:20:00.000Z',
      position: 89,
      variant: 'easy',
      exercises: [
        { pattern: 'core', rungId: 'core-04-hollow-hold', sets: 2, targetValue: 22 },
        { pattern: 'pull', rungId: 'pull-04-reverse-snow-angel', sets: 2, targetValue: 27 },
      ],
    },
  ],
  settings: { persistGranted: true, sync: null },
}
