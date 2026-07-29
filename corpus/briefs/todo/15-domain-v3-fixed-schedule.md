# Task 15 — Domain v3: the fixed schedule

## Context

A second design grill on 2026-07-29 **deleted adaptation from the app**. Nothing is
measured, nothing branches on what the user did, and the prescription is a pure
function of how many sessions of a pattern have been completed. Read, in this order:

1. [wiki/progression-engine.md](../../wiki/progression-engine.md) — the law, the
   interpolation, and the exact list of what is deleted. **This is your spec.**
2. [wiki/programme.md](../../wiki/programme.md) — the rotation, the per-rung hold caps,
   the cardio day.
3. [wiki/decisions.md](../../wiki/decisions.md) — why, and which calls are locked.

`../../../SPEC.md` describes **v1** and is superseded. Do not follow it.

This brief is the keystone: briefs 16–20 all code against the types you land here.
Get the contract right before the implementation.

## Files you OWN

```
src/domain/types.ts                     rewrite — the v3 contract
src/domain/schedule.ts                  NEW — replaces engine.ts
src/domain/ladders.ts                   per-rung ranges, floor-only fixes, cardio, flags
src/domain/__tests__/types.test.ts      rewrite
src/domain/__tests__/ladders.test.ts    rewrite
src/domain/__tests__/schedule.test.ts   NEW
src/domain/__tests__/fixtures.ts        rewrite — much smaller
DELETE: src/domain/engine.ts
DELETE: src/domain/progress.ts
DELETE: src/domain/__tests__/engine.test.ts
DELETE: src/domain/__tests__/simulate.ts
DELETE: src/domain/__tests__/simulate.test.ts
```

## Files you must NOT touch

`src/persistence/**` (brief 16 owns the migration), `src/ui/**` (briefs 18–20),
`server/**` (brief 17), `eslint.config.js`, `vite.config.ts`, `package.json`.

Deleting `progress.ts` and `engine.ts` will break `src/persistence/**` and
`src/ui/**` imports. **That is expected.** Leave them broken and say so in your
report — brief 16 and 19 repair their own side. Do not reach across the boundary.

## 1. The type contract

```ts
export type Pattern = 'push' | 'squat' | 'hinge' | 'core' | 'pull'
export type TargetUnit = 'reps' | 'seconds'
export type Variant = 'easy' | 'medium' | 'hard'

export interface Range { readonly min: number; readonly max: number }

export interface Rung {
  readonly id: RungId
  readonly name: string
  readonly cues: readonly string[]
  readonly modifier?: Modifier
  readonly figureId?: string
  /** Overrides the ladder default. REQUIRED on every `seconds` rung — the
   *  evidence-based ceilings genuinely differ per exercise (plank 60s, L-sit 30s). */
  readonly range?: Range
  /** Failing this rung is injurious, not merely unsuccessful. The UI must render
   *  the safety cue first and visually separated. See §5. */
  readonly safetyCritical?: boolean
}

export interface Ladder {
  readonly pattern: Pattern
  readonly unit: TargetUnit
  readonly kind: 'strength' | 'postural'
  readonly startRungIndex: number
  readonly range: Range                 // default when a rung declares none
  readonly sessionsPerRung: number      // 14 for reps ladders, 42 for the daily block
  readonly rungs: readonly Rung[]
}
```

`sessionsPerRung` **is the law** — a rung takes ~6 weeks, and 14 / 42 are just
`sessions per week × 6` for a pattern trained 2.3×/week and 7×/week respectively.
Comment it as such where it is declared, because a future reader will otherwise read
14 and 42 as arbitrary.

### The rotation replaces the 7-position cycle

```ts
export interface RotationSlot {
  readonly label: string                     // 'Push' | 'Legs' | 'Cardio'
  readonly patterns: readonly Pattern[]      // the strength work; [] on cardio
  readonly cardio: boolean
}

/** Push · Legs · Cardio. Cardio always FOLLOWS legs and never precedes it — that
 *  ordering is the whole reason for this sequence. Do not reorder. */
export const ROTATION: readonly [RotationSlot, RotationSlot, RotationSlot]

/** Trained in EVERY session, on top of the slot's own patterns. */
export const DAILY_BLOCK: readonly Pattern[] = ['core', 'pull']

export function slotAt(position: number): RotationSlot   // positive modulo
```

`slotAt` must survive a hand-edited negative or absurd position without throwing — the
state file is expected to be hand-edited, so out-of-range input is a normal case.

### Results and state

```ts
export interface ExerciseRecord {
  readonly pattern: Pattern
  readonly rungId: RungId
  readonly sets: number          // a COUNT, not an array — nothing per-set is measured
  readonly targetValue: number   // what was prescribed, after the variant
}

export interface SessionResult {
  readonly completedAt: IsoTimestamp   // stored; NOTHING in src/ui may read it
  readonly position: number
  readonly variant: Variant
  readonly exercises: readonly ExerciseRecord[]
}

export interface StateDoc {
  readonly schemaVersion: 3
  readonly username: string
  readonly cyclePosition: number
  readonly sessionsDone: Readonly<Record<Pattern, number>>   // the whole mutable state
  readonly history: readonly SessionResult[]
  readonly settings: Settings
}

export interface Settings {
  readonly persistGranted: boolean | null
  readonly sync: SyncSettings | null
}
```

**Deleted from the contract, with no replacement:** `LadderState`, `SetResult`,
`Effort`, `CycleDay`, `CYCLE`, `CycleDaySpec`, `cycleDayAt`, and
`Settings.soundEnabled` / `voiceEnabled` / `skipWarmupByDefault` (audio and the warmup
are out of v2 scope).

`CURRENT_SCHEMA_VERSION = 3`.

## 2. `schedule.ts` — the whole of the logic

```ts
export function rungIndexAt(pattern: Pattern, sessionsDone: number): number
export function rangeAt(pattern: Pattern, rungIndex: number): Range
export function targetAt(pattern: Pattern, sessionsDone: number): number
export function applyVariant(target: number, unit: TargetUnit, variant: Variant, range: Range): number
export function prescribe(state: StateDoc, variant: Variant): Prescription
export function recordSession(state: StateDoc, result: SessionResult): StateDoc
```

The interpolation, exactly:

```
rungIndex        = min(startRungIndex + ⌊sessionsDone / sessionsPerRung⌋, rungs.length − 1)
sessionsIntoRung = sessionsDone mod sessionsPerRung
fraction         = sessionsIntoRung / sessionsPerRung
target           = round(min + fraction × (max − min))
```

Three properties must be tested as properties, not as example values, because they are
the *reason* for this formulation:

1. **Every rung takes `sessionsPerRung` sessions**, whatever its span.
2. **The top rung cycles.** Once `rungIndex` clamps, the modulo keeps running, so the
   target sweeps min→max→min forever. There must be **no special case** for this — if
   you find yourself writing one, the formula is wrong.
3. **Re-tuning a rung's range does not change anyone's rung index.**

Also assert the derived steps match the law: push goes +1 rep per 2 sessions, a 20→60s
plank +1s per session, a 10→30s prone Y +1s per 2 sessions.

### The variant

```
easy    −2 reps / −5 seconds, clamped to range.min (and never below 3 reps)
medium  the schedule's own number
hard    +2 reps / +5 seconds, clamped to range.max
```

**`hard` is a no-op at `range.max`, deliberately** — the rep ceiling exists because past
~12–15 bodyweight reps the adaptation drifts to endurance, and the variant must not be a
way around it. Test that explicitly.

**The variant must not touch `sessionsDone`.** That independence is the single most
important test in this brief: an easy day costs no progress and banks no debt.

### `recordSession`

Increments `cyclePosition` by 1, increments `sessionsDone[p]` for every pattern the
session trained (the slot's patterns **plus** `DAILY_BLOCK`), and appends to history.
**No conditionals.** If you write an `if` in this function, something is wrong.

### `prescribe`

Returns, for the current slot: the slot label, then one entry per exercise in order —
the slot's strength patterns at `SETS_PER_STRENGTH = 3`, then the daily block at
`SETS_PER_DAILY_BLOCK = 2`. On a cardio slot, the cardio entry at `CARDIO_ROUNDS = 5`
instead of a strength pattern. Each entry carries the rung (name, cues, figureId,
modifier), the unit, and the post-variant target.

## 3. `ladders.ts` — content changes

**a. Per-rung ranges.** Every `seconds` rung declares its own, from
[programme.md](../../wiki/programme.md#hold-caps-per-rung): front plank 20→60, side
plank 15→45, hollow hold 15→45, hollow rock 15→45, tuck L-sit 10→30, prone Y 10→30,
prone T 10→30, Y-T-W combo 20→45, reverse snow angel 20→45, prone lat slide 20→45,
end-range isometric 20→45, dead bug 20→45.

**b. Floor-only fixes**, carried forward verbatim from superseded brief 13, which
specified them before it was split:

- **Hinge rungs 5–6 anchor the heels under a couch.** Replace with the **sliding leg
  curl** (supine, heels on towels on a smooth floor, hips bridged, extend and flex the
  knees). Not a downgrade — it biases *biceps femoris*, which the nordic does not, and
  needs nothing but a floor and a towel. Ladder shape: *double-leg bridge → single-leg
  bridge, heel far from hips → bilateral sliding curl → eccentric-only bilateral →
  single-leg slide.*
- **Push rungs 1–2 use a kitchen counter and a chair.** Replace with **wall** and
  **knee** variants. Keep the easy end genuinely easy.

**Rung ids are immutable once shipped.** A replacement that changes the movement gets a
**new** id; do not reuse `hinge-05-nordic-negative` for a sliding leg curl. Old ids may
still appear in persisted history, so `findRungById` must keep returning `undefined`
rather than throwing for them.

**c. `safetyCritical: true`** on rungs whose failure mode is injurious rather than
merely unsuccessful. After the floor-only fix that is: `core-04-hollow-hold`,
`core-05-hollow-rock`, `core-06-tuck-l-sit`, `squat-07-assisted-single-leg`,
`squat-08-pistol-progression`, `push-09-archer`. Keep `NEVER_A_STARTING_RUNG` and its
rule-asserting test; add a test that the two sets agree.

**d. Cardio content.** A cardio slot trains no ladder, so it does not fit `Ladder`. Give
it its own small shape and say why in a comment. **5 rounds of 60s hard**, lower-body
only (high knees, fast bodyweight squats), prescribed **by breathlessness — never by rep
count**. A rep target lets the user self-pace down to nothing, which is exactly the
failure mode; intensity is the active ingredient. Do not "optimise" 60s into a Tabata:
4×4min gave 6.5% VO2max against 3.3% for 8×20s.

**e. Preserve every cue convention brief 03 established**: every rung states its tempo
explicitly including "steady, no pause"; a pause names both its duration and its
location in words; every rung carries a stop-the-set signal; a cross-reference never
replaces an absolute instruction.

## 4. `fixtures.ts`

Much smaller than the v2 fixture — there is no replay property left to prove, because
there is no accumulated state. Export one `midProgram: StateDoc` with the five patterns
at differing `sessionsDone` (so a UI test can distinguish them), a handful of history
entries with mixed variants, and `schemaVersion: 3`. Drop `midProgramStart` and
`midProgramHistory`.

## 5. Safety cue ordering

`Rung.cues[0]` is already the setup cue and the safety check on the risky rungs. Add a
comment where `safetyCritical` is declared stating the UI contract: **on a
`safetyCritical` rung the first cue renders first and visually separated**, not as item
one of four. Brief 19 implements it; you own saying so.

## Acceptance

- `npm run typecheck` and `npm run lint` clean **for `src/domain/**` and its tests**.
  Breakage in `src/persistence/**` and `src/ui/**` is expected and must be listed in
  your report, not fixed.
- `npx vitest run src/domain` green.
- Tests assert, as properties rather than example values: every rung takes
  `sessionsPerRung` sessions; the top rung cycles with no special case; the variant
  never mutates `sessionsDone`; `hard` is a no-op at `range.max`; `slotAt` survives
  negative and absurd positions; `recordSession` contains no branch on session content;
  cardio never prescribes a rep count; the daily block is trained in every slot.
- A test greps every cue string for `chair`, `couch`, `sofa`, `bed`, `stair`, `door`,
  `table`, `counter`, `windowsill` and fails on a hit. Towels and the floor only.
- A test asserts every `seconds` rung declares its own `range`.
- The pull ladder still carries `kind: 'postural'` and `POSTURAL_NOTICE`, and no pull
  rung name borrows row or pull-up vocabulary.
- Print the derived schedule for all five patterns at sessions 0, 7, 14, 15, 42, 200 and
  1000 as a readable table. **Eyeball it and report your honest verdict** on whether the
  pace looks sane — this is the one number in the programme with no evidence behind it
  ([open-questions.md](../../wiki/open-questions.md) #1).
- Re-run brief 03's discriminability gate on every changed rung: read adjacent rungs
  back to back and confirm the cues alone tell you what to do differently.
