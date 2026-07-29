/**
 * Shared test fixtures. Briefs 04, 05, 09 and 11 all reuse `midProgram` — it is
 * deliberately realistic rather than minimal, because a two-session fixture
 * cannot exercise a rung advance, a missed streak, a deload, or a chart with a
 * visible trend, which is exactly what those briefs need to verify.
 *
 * ── Repaired 2026-07-29 (wave-3 gate) ───────────────────────────────────────
 *
 * The first version of this file was written before `ladders.ts` existed and its
 * ladder states were NOT reachable by replaying its own history: wrong rung
 * indices (rung ids are 1-based, `getRung` is 0-based), a `target` of 13 above
 * the rep cap of 12, and a rung advance recorded at a sub-max target. Brief 03
 * spotted two of those and correctly declined to edit a file it didn't own.
 *
 * The fixture is now **replay-verifiable**: `midProgramStart` is the state
 * before the first recorded session, and
 *
 *     midProgramHistory.reduce(applySession, midProgramStart)  ===  midProgram
 *
 * `engine.test.ts` asserts exactly that. It turns this file from a pile of
 * asserted numbers into a property the engine has to satisfy — which is the only
 * version of a fixture worth testing an engine against.
 *
 * ── Target step, decided at the wave-3 gate ─────────────────────────────────
 *
 * Rep ladders step by 1 (5→12, eight targets per rung). Time ladders step by
 * **5 seconds** (20→45, six targets per rung), NOT by 1: a one-second step would
 * mean 26 sessions to clear a single rung of planks, and it would break
 * `progressIndex`, whose `× 8` is the rep span.
 *
 *     targetStep(unit)      →  unit === 'seconds' ? 5 : 1
 *     stepsPerRung(unit)    →  unit === 'seconds' ? 6 : 8
 *     progressIndex         →  rungIndex * stepsPerRung + (target - min) / step
 *
 * ── Re-authored 2026-07-29 (brief 12: domain v2) ────────────────────────────
 *
 * Three changes landed together and two of them force this file to change shape,
 * not just contents:
 *
 *   1. **`ExerciseResult.effort` is gone** (schema v2). Every `effort` rating was
 *      removed mechanically; no set value was touched to compensate. The engine's
 *      only input is now "was every set completed".
 *   2. **The cycle has seven positions, two of them cardio**:
 *      A · B · C · CARDIO · A · B · CARDIO. This is the one change that could not
 *      be absorbed by editing values, because the old history's day sequence
 *      (A B C · A B C · A B C) is **not producible by the new cycle at all** — a
 *      seven-position cycle only reaches day C once per turn, and it interleaves
 *      cardio days that train nothing. A history that does not follow the cycle
 *      is not a valid input, so this one had to be re-authored rather than
 *      patched. See the DEVIATION note below.
 *   3. Ladders start mid-ladder, which is why `midProgramStart` sits where it
 *      does. It is unchanged from the previous version of this file.
 *
 * **DEVIATION, stated plainly.** The standing rule on this fixture is "do not
 * rewrite the hand-authored input to make an engine pass". The input below *is*
 * re-authored — 21 sessions where there were 9 — and the justification is that
 * the cycle it had to be coherent with changed shape, not that the engine
 * disagreed with it. Two things were preserved to keep the rule's intent intact:
 *
 *   - `midProgramStart` is byte-for-byte the old one.
 *   - Every original per-pattern log was carried forward where the new cycle
 *     allows it: push still runs 3×10 → 3×11 → 3×12 at `push-03-knees`, squat
 *     still runs 3×10 → 3×11 → 3×12 at `squat-02-bodyweight`, hinge still starts
 *     3×11 at `hinge-01-glute-bridge` and then starts missing, core still runs
 *     25s → 30s → 35s at `core-02-plank`, pull still walks 20s up to 45s at
 *     `pull-01-prone-y`. The new sessions extend those trajectories; they do not
 *     revise them.
 *
 * And `midProgram.ladders` was derived by hand from the rule table **before** the
 * engine was run over it — the session-by-session derivation is written out above
 * the value, with the rule that fired at each step, so a person can check the
 * arithmetic without executing anything. A snapshot copied out of the engine
 * cannot test the engine.
 *
 * ── What the log staleness did, and why it is gone ──────────────────────────
 *
 * The previous version had a deliberately *stale* squat log: wave-4 ruling 1 let
 * a sub-max `easy` fast-track the ladder at session 2, so later squat entries
 * recorded work at a rung the engine had already left behind, and
 * `deriveLadderStates` (which trusts the log) disagreed with `applySession`
 * (which trusts `state.ladders`).
 *
 * With `easy` deleted there is no fast-track, so nothing in this history can move
 * a ladder anywhere the log does not also record. **The staleness resolves
 * itself**: `deriveLadderStates(midProgramHistory)` now equals
 * `midProgram.ladders` on all five patterns, and `engine.test.ts` asserts that.
 * The two functions still read different things on purpose — that is proved by
 * the hand-edit tests rather than by a stale fixture.
 */
import type {
  ExerciseResult,
  LadderState,
  Pattern,
  SessionResult,
  SetResult,
  Settings,
  StateDoc,
} from '../types.ts'
import { CURRENT_SCHEMA_VERSION, CYCLE } from '../types.ts'

/** `sets(12, 12, 12, 10)` → three sets targeting 12, the last one missed at 10. */
export function sets(target: number, ...actuals: number[]): readonly SetResult[] {
  return actuals.map((actualValue) => ({ targetValue: target, actualValue }))
}

export const defaultSettings: Settings = {
  soundEnabled: true,
  voiceEnabled: true,
  skipWarmupByDefault: false,
  persistGranted: null,
  sync: null,
}

export function ladderState(
  rungIndex: number,
  target: number,
  cleanAtMax = 0,
  missedStreak = 0,
): LadderState {
  return { rungIndex, target, cleanAtMax, missedStreak }
}

function ex(
  pattern: Pattern,
  rungId: ExerciseResult['rungId'],
  setResults: readonly SetResult[],
): ExerciseResult {
  return { pattern, rungId, sets: setResults }
}

/**
 * A cardio day. **No exercises at all** — it trains no ladder, so applying it
 * must advance `sessionsCompleted` and `cyclePosition` while leaving every
 * ladder state byte-identical. Six of the 21 sessions below are these, which is
 * what makes "a session that changes nothing" part of the replay property rather
 * than a separate special case.
 */
function cardio(completedAt: string): SessionResult {
  return { completedAt, day: 'D', exercises: [] }
}

/**
 * State immediately before the first recorded session. Rung indices are 0-based
 * and match the 1-based rung ids below: `push-03-knees` is index 2.
 *
 * Unchanged across the v2 re-authoring apart from `schemaVersion`. Worth noting
 * that it is *close to* — but deliberately not equal to — a fresh document under
 * the new mid-ladder starts (`push` 2, `squat` 1, `hinge` 1, `core` 1, `pull` 1):
 * the targets have already climbed, and `hinge` and `pull` sit a rung lower than
 * a fresh start, which is what a user who has already been walked *down* by the
 * regress rule looks like.
 */
export const midProgramStart: StateDoc = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  sessionsCompleted: 0,
  cyclePosition: 0,
  ladders: {
    push: ladderState(2, 10), // push-03-knees
    squat: ladderState(1, 10), // squat-02-bodyweight
    hinge: ladderState(0, 11), // hinge-01-glute-bridge
    core: ladderState(1, 25), // core-02-plank
    pull: ladderState(0, 20), // pull-01-prone-y
  },
  history: [],
  settings: defaultSettings,
}

/**
 * Twenty-one completed sessions — **three full turns of the seven-position
 * cycle**, cardio days included:
 *
 *     A B C D A B D | A B C D A B D | A B C D A B D
 *     1 2 3 4 5 6 7 | 8 9 … … … … 14| 15 … … … … … 21
 *
 * Every ladder follows a different trajectory on purpose, because a fixture
 * where everything behaves identically hides most engine bugs. Five patterns,
 * five *different* rules of the five-row table:
 *
 *   push   10 → 11 → 12 → 12 → advance → 5 → 6
 *          the sub-max bump, then a rung advance on the second completed session
 *          at the cap — the only route up any ladder now.
 *   squat  10 → miss → 11 → miss → miss → 12
 *          misses must be CONSECUTIVE. Two misses then a completed session, and
 *          the streak clears instead of deloading.
 *   hinge  11 → miss → miss → MISS×3 → deload → 11 → 12
 *          the third consecutive miss regresses. At rung 0 there is no rung
 *          below, so the target steps down instead — the floor deload.
 *   core   25 → 30 → 35
 *          the plain time-ladder climb: +5s per completed session, not +1s.
 *   pull   20 → … → 45 → 45 → advance → 20 → 25
 *          a TIME ladder advancing, which under v2 happens by exactly the same
 *          two-completed-sessions-at-max rule as a rep ladder. There is no
 *          longer any difference between the two, which is the point.
 *
 * `push`'s advance (3×12 → 3×5) is the transition a raw-reps chart renders as a
 * *regression*, which is precisely why brief 09 must plot `progressIndex`.
 * `hinge`'s floor deload is the transition where `progressIndex` falls with NO
 * change in `rungIndex`, which is why brief 09 cannot key its annotation on the
 * rung alone.
 *
 * The gap between session 14 (2026-07-19) and session 15 (2026-07-27) is
 * deliberate: eight days off, and the cycle resumes at exactly the next position.
 * There is no date arithmetic in the engine and therefore no missed day.
 */
export const midProgramHistory: readonly SessionResult[] = [
  // ── turn 1 ────────────────────────────────────────────────────────────────
  {
    // S1, position 0, day A.
    completedAt: '2026-07-06T07:12:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-03-knees', sets(10, 10, 10, 10)),
      ex('pull', 'pull-01-prone-y', sets(20, 20, 20, 20)),
    ],
  },
  {
    // S2, position 1, day B.
    completedAt: '2026-07-07T07:05:00.000Z',
    day: 'B',
    exercises: [
      ex('squat', 'squat-02-bodyweight', sets(10, 10, 10, 10)),
      ex('hinge', 'hinge-01-glute-bridge', sets(11, 11, 11, 11)),
    ],
  },
  {
    // S3, position 2, day C.
    completedAt: '2026-07-08T06:58:00.000Z',
    day: 'C',
    exercises: [
      ex('core', 'core-02-plank', sets(25, 25, 25, 25)),
      ex('pull', 'pull-01-prone-y', sets(25, 25, 25, 25)),
    ],
  },
  // S4, position 3 — the first cardio day. Trains nothing.
  cardio('2026-07-09T07:02:00.000Z'),
  {
    // S5, position 4, day A.
    completedAt: '2026-07-10T07:20:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-03-knees', sets(11, 11, 11, 11)),
      ex('pull', 'pull-01-prone-y', sets(30, 30, 30, 30)),
    ],
  },
  {
    // S6, position 5, day B. First miss on each leg pattern.
    completedAt: '2026-07-11T07:31:00.000Z',
    day: 'B',
    exercises: [
      // Last set short of 11 → miss, streak 1, hold.
      ex('squat', 'squat-02-bodyweight', sets(11, 11, 11, 10)),
      // Last set short of 12 → miss, streak 1, hold.
      ex('hinge', 'hinge-01-glute-bridge', sets(12, 12, 12, 10)),
    ],
  },
  // S7, position 6 — cardio.
  cardio('2026-07-12T07:08:00.000Z'),

  // ── turn 2 ────────────────────────────────────────────────────────────────
  {
    // S8, position 7, day A.
    completedAt: '2026-07-13T07:15:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-03-knees', sets(12, 12, 12, 12)),
      ex('pull', 'pull-01-prone-y', sets(35, 35, 35, 35)),
    ],
  },
  {
    // S9, position 8, day B. The two leg patterns diverge here.
    completedAt: '2026-07-14T07:26:00.000Z',
    day: 'B',
    exercises: [
      // Completed. The squat streak breaks at one — misses must be consecutive.
      ex('squat', 'squat-02-bodyweight', sets(11, 11, 11, 11)),
      // Second consecutive miss. Hold; a third would deload.
      ex('hinge', 'hinge-01-glute-bridge', sets(12, 12, 11, 10)),
    ],
  },
  {
    // S10, position 9, day C.
    completedAt: '2026-07-15T06:55:00.000Z',
    day: 'C',
    exercises: [
      ex('core', 'core-02-plank', sets(30, 30, 30, 30)),
      ex('pull', 'pull-01-prone-y', sets(40, 40, 40, 40)),
    ],
  },
  // S11, position 10 — cardio.
  cardio('2026-07-16T07:04:00.000Z'),
  {
    // S12, position 11, day A. push's second completed 3×12 → rung advance.
    completedAt: '2026-07-17T07:15:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-03-knees', sets(12, 12, 12, 12)),
      ex('pull', 'pull-01-prone-y', sets(45, 45, 45, 45)),
    ],
  },
  {
    // S13, position 12, day B. hinge's third consecutive miss → deload.
    completedAt: '2026-07-18T07:09:00.000Z',
    day: 'B',
    exercises: [
      ex('squat', 'squat-02-bodyweight', sets(12, 12, 12, 11)),
      ex('hinge', 'hinge-01-glute-bridge', sets(12, 12, 10, 9)),
    ],
  },
  // S14, position 13 — cardio, and the last session before an eight-day gap.
  cardio('2026-07-19T07:44:00.000Z'),

  // ── turn 3, after eight days off ──────────────────────────────────────────
  {
    // S15, position 14, day A. pull's second completed 45s → rung advance.
    completedAt: '2026-07-27T07:33:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-04-full', sets(5, 5, 5, 5)),
      ex('pull', 'pull-01-prone-y', sets(45, 45, 45, 45)),
    ],
  },
  {
    // S16, position 15, day B.
    completedAt: '2026-07-28T07:11:00.000Z',
    day: 'B',
    exercises: [
      // Second consecutive miss for squat. Still a hold, not a deload.
      ex('squat', 'squat-02-bodyweight', sets(12, 12, 11, 11)),
      // Back at 3×11 after the deload, and completed.
      ex('hinge', 'hinge-01-glute-bridge', sets(11, 11, 11, 11)),
    ],
  },
  {
    // S17, position 16, day C. pull is on its new rung now.
    completedAt: '2026-07-29T06:59:00.000Z',
    day: 'C',
    exercises: [
      ex('core', 'core-02-plank', sets(35, 35, 35, 35)),
      ex('pull', 'pull-02-prone-t', sets(20, 20, 20, 20)),
    ],
  },
  // S18, position 17 — cardio.
  cardio('2026-07-30T07:06:00.000Z'),
  {
    // S19, position 18, day A.
    completedAt: '2026-07-31T07:21:00.000Z',
    day: 'A',
    exercises: [
      ex('push', 'push-04-full', sets(6, 6, 6, 6)),
      ex('pull', 'pull-02-prone-t', sets(25, 25, 25, 25)),
    ],
  },
  {
    // S20, position 19, day B. Both leg patterns complete a 3×12 at the cap.
    completedAt: '2026-08-01T07:38:00.000Z',
    day: 'B',
    exercises: [
      ex('squat', 'squat-02-bodyweight', sets(12, 12, 12, 12)),
      ex('hinge', 'hinge-01-glute-bridge', sets(12, 12, 12, 12)),
    ],
  },
  // S21, position 20 — cardio. Closes the third turn.
  cardio('2026-08-02T07:49:00.000Z'),
]

/**
 * The state `midProgramStart` reaches after replaying `midProgramHistory`.
 * `engine.test.ts` must prove this by reduction rather than trusting these
 * numbers.
 *
 * ── Derived by hand from the five-row rule table ────────────────────────────
 *
 * Session numbers are 1-based ordinals into `midProgramHistory`. The six cardio
 * sessions (S4, S7, S11, S14, S18, S21) appear nowhere below because they train
 * nothing: they advance the counters and leave every ladder untouched.
 *
 * **push** — starts (rung 2 `push-03-knees`, 3×10). Rep ladder: step 1, cap 12.
 *   S1  3×10 completed, 10 < 12          → target + 1          → (2, 11)
 *   S5  3×11 completed, 11 < 12          → target + 1          → (2, 12)
 *   S8  3×12 completed, AT cap, 1st time → hold, cleanAtMax 1  → (2, 12, cm 1)
 *   S12 3×12 completed, AT cap, 2nd time → rung + 1, target=min→ (3, 5)
 *   S15 3×5  completed, 5 < 12           → target + 1          → (3, 6)
 *   S19 3×6  completed, 6 < 12           → target + 1          → (3, 7)
 *   FINAL push = (3, 7, 0, 0)
 *
 * **squat** — starts (rung 1 `squat-02-bodyweight`, 3×10). This ladder exists to
 * pin that a missed streak has to be *consecutive*.
 *   S2  3×10 completed                   → target + 1          → (1, 11)
 *   S6  11/11/10, MISSED, streak 1 of 3  → hold                → (1, 11, 0, ms 1)
 *   S9  3×11 completed                   → streak CLEARED,
 *                                          target + 1          → (1, 12)
 *   S13 12/12/11, MISSED, streak 1       → hold                → (1, 12, 0, ms 1)
 *   S16 12/11/11, MISSED, streak 2       → hold                → (1, 12, 0, ms 2)
 *   S20 3×12 completed, AT cap, 1st time → streak cleared,
 *                                          cleanAtMax 1        → (1, 12, cm 1)
 *   FINAL squat = (1, 12, 1, 0). Two misses and no deload: the third would have
 *   had to be consecutive, and S20 completed.
 *
 * **hinge** — starts (rung 0 `hinge-01-glute-bridge`, 3×11). This ladder exists
 * to pin the deload, and specifically the deload at the FLOOR of a ladder.
 *   S2  3×11 completed                   → target + 1          → (0, 12)
 *   S6  12/12/10, MISSED, streak 1       → hold                → (0, 12, 0, ms 1)
 *   S9  12/11/10, MISSED, streak 2       → hold                → (0, 12, 0, ms 2)
 *   S13 12/10/9,  MISSED, streak 3       → REGRESS. rungIndex − 1
 *                                          is −1, clamped to 0; at the floor the
 *                                          target steps down instead: 12 − 1 = 11.
 *                                          Streak restarts.      → (0, 11, 0, 0)
 *   S16 3×11 completed                   → target + 1          → (0, 12)
 *   S20 3×12 completed, AT cap, 1st time → cleanAtMax 1        → (0, 12, cm 1)
 *   FINAL hinge = (0, 12, 1, 0). Note S13 → S16: `progressIndex` fell from 7 to 6
 *   with `rungIndex` unchanged at 0.
 *
 * **core** — starts (rung 1 `core-02-plank`, 3×25s). Time ladder: step 5, cap 45.
 *   S3  3×25s completed                  → target + 5          → (1, 30)
 *   S10 3×30s completed                  → target + 5          → (1, 35)
 *   S17 3×35s completed                  → target + 5          → (1, 40)
 *   FINAL core = (1, 40, 0, 0). Three sessions, three +5s steps — never +1s.
 *
 * **pull** — starts (rung 0 `pull-01-prone-y`, 3×20s). Nine sessions, because a
 * postural hold is trained on both day A and day C.
 *   S1  20s completed → 25   S3  25s → 30   S5  30s → 35
 *   S8  35s → 40             S10 40s → 45
 *   S12 3×45s completed, AT cap, 1st time → cleanAtMax 1       → (0, 45, cm 1)
 *   S15 3×45s completed, AT cap, 2nd time → rung + 1, target=min→ (1, 20)
 *   S17 3×20s completed                   → target + 5         → (1, 25)
 *   S19 3×25s completed                   → target + 5         → (1, 30)
 *   FINAL pull = (1, 30, 0, 0). A time ladder advancing by the *same* rule as a
 *   rep ladder — under v1 this ladder had no route up at all except this one, and
 *   now neither does any other.
 *
 * ── Counters ───────────────────────────────────────────────────────────────
 *
 * 21 sessions applied, so `sessionsCompleted` and `cyclePosition` are both 21.
 * 21 mod 7 = 0, so the next prescription is position 0 — day A, push + pull.
 */
export const midProgram: StateDoc = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  sessionsCompleted: midProgramHistory.length,
  cyclePosition: midProgramHistory.length,
  ladders: {
    // S12: the second completed 3×12 at the cap → rung 2 → 3, target reset to 5.
    // Then S15 and S19 walked it 5 → 6 → 7 on `push-04-full`.
    push: ladderState(3, 7),
    // S20's completed 3×12 cleared a two-deep missed streak and started the
    // clean-at-max count. One more completed 3×12 advances to `squat-03-3s-down`.
    squat: ladderState(1, 12, 1),
    // Deloaded at S13 (12 → 11, rung unchanged at the floor), re-climbed to 12 at
    // S16, and S20 was the first completed session at the cap.
    hinge: ladderState(0, 12, 1),
    // 25 → 30 → 35 → 40, still `core-02-plank`. Five more seconds each time.
    core: ladderState(1, 40),
    // Six completed sessions walked 20s to 45s, S12 and S15 were the two at the
    // cap that advanced it, and S17/S19 started `pull-02-prone-t` at 20s → 30s.
    pull: ladderState(1, 30),
  },
  history: midProgramHistory,
  settings: defaultSettings,
}

export const CYCLE_LENGTH = CYCLE.length
