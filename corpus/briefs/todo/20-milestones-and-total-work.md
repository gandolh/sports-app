# Task 20 — Milestones and total work ever

## Context

The account page needs stats, and a fixed schedule offers almost none. Charts are out:
reps are a pure function of sessions completed, so plotting progress against session
number is a straight line containing no information. That left two things the user picked
([decisions.md](../../wiki/decisions.md#four-screens-and-only-one-of-them-is-the-training-flow)):

- **Milestones reached** — "session 34 — reached the full push-up."
- **Total work done, ever** — "14,208 reps and 2h 41m of holds since you started."

Both are derivable from the state document with no new stored data, and **neither may
use a date**. Milestones key off *session number*; total work needs no clock at all.
That is not a coincidence — it is why these two were chosen over a consistency chart,
and it is what let the no-dates invariant survive the redesign intact.

Depends on brief 15's contract.

## Files you OWN

```
src/domain/milestones.ts
src/domain/__tests__/milestones.test.ts
```

## Files you must NOT touch

Everything else. `src/ui/routes/account` (brief 19) consumes what you export; agree the
shape by writing it here first and reporting it.

`src/domain/` is **pure** — no browser API, no `new Date()`, no `Date.now()`, no
`Math.random()`. `eslint.config.js` enforces this and will fail the build. Any duration
you produce is a number of seconds, formatted by the caller.

## 1. Milestones

```ts
export interface Milestone {
  readonly sessionNumber: number   // 1-based; the session at which it was reached
  readonly pattern: Pattern
  readonly kind: 'rung' | 'named'
  readonly label: string
}

export function milestonesReached(doc: StateDoc): readonly Milestone[]
```

Two kinds:

- **`rung`** — reaching a new rung on any ladder. Derived from history: for each session,
  compute each pattern's rung index at that point and emit one when it increases.
- **`named`** — a handful of thresholds worth calling out by name because the rung index
  means nothing to a person. At minimum: the first full push-up (`push-04-full`), a
  60-second plank, a 45-second side plank per side, the first unassisted bodyweight squat
  (`squat-02-bodyweight`), and reaching the top of any ladder. Add others if the content
  suggests them, and **state your list in the report** so the copy can be reviewed.

Ordering is newest-first, because that is how the account page reads.

Reaching the **top of a ladder** is a milestone with specific wording: the target now
cycles indefinitely, and that is the ceiling of floor-only training rather than a
failure. Say so in the label. Do not use the word "plateau".

### The reconstruction has a trap

A rung index depends on `sessionsDone`, which is a *current* count — so you cannot ask
"what rung was I on at session 12" without replaying. Replay the history, counting each
pattern's appearances as you go, and compute the rung index from the count at that point.
**Do not use the document's current `sessionsDone`** for historical positions; it will
attribute every milestone to the wrong session, and the bug will look like an off-by-one
rather than a category error.

## 2. Total work

```ts
export interface TotalWork {
  readonly reps: number            // summed over rep-based exercises
  readonly holdSeconds: number     // summed over time-based exercises
  readonly sessions: number
  readonly perPattern: Readonly<Record<Pattern, { reps: number; holdSeconds: number }>>
}

export function totalWork(doc: StateDoc): TotalWork
```

Sum `sets × targetValue` per exercise record, split by the ladder's unit. Note honestly
in a comment what this number *is*: **work prescribed, not work verified** — the app
measures nothing, so this is the sum of what it asked for. It is still the most
motivating figure available and it is not a lie, but the distinction belongs in the code
rather than only in someone's head.

Cardio rounds are neither reps nor holds. Decide whether to count them and say which in
your report; if you count them, do it in a separate field rather than inflating either
existing one.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npx vitest run src/domain/__tests__/milestones` clean.
- A test builds a history spanning at least two rung advances on two different patterns
  and asserts each milestone's `sessionNumber` is the session at which it was actually
  reached — **specifically catching the current-`sessionsDone` trap above**.
- A test asserts an empty document produces no milestones and zero work, without
  throwing.
- A test asserts a document sitting at the top of a ladder emits the ceiling milestone
  exactly once, not once per subsequent session.
- A test asserts `totalWork` splits reps and seconds by the ladder's unit and never mixes
  them.
- A test asserts the module reads no clock (it will fail lint if it does, but assert the
  output is a bare number of seconds so the caller owns formatting).
- **Report your named-milestone list and the cardio decision** — both are copy choices
  as much as code ones.
