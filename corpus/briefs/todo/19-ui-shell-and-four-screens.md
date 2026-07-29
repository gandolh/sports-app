# Task 19 — UI shell: four routes, the one-exercise-per-page player, and the two invariant tests

## Context

This is the app. Everything before it was the machinery. Read, in this order:

1. [wiki/decisions.md](../../wiki/decisions.md#four-screens-and-only-one-of-them-is-the-training-flow)
   — the routes and why only one of them is the training path.
2. [wiki/architecture.md](../../wiki/architecture.md#the-player-mechanically) — the
   player's exact mechanics.
3. [wiki/design-system.md](../../wiki/design-system.md) — the visual language.
   **Apply it; do not invent one.** Its Anti-patterns list is a set of build failures,
   not suggestions.
4. [wiki/programme.md](../../wiki/programme.md) — what a session contains.

Load the **`impeccable`** skill for the visual work.

Supersedes brief 14, whose Base UI / TanStack choices and two mechanical enforcement
tests are carried forward here. Everything else in it was invalidated.

## Files you OWN

```
src/ui/routes/                 __root · index (home + player) · week · account · login
src/ui/components/             the shared pieces — dots, target, cue list, countdown ring
src/ui/App.tsx                 router wiring
src/ui/__tests__/
src/session/useSession.ts      NEW — which exercise, which set
src/session/timer.ts           NEW — timestamp-based countdown
src/session/wakeLock.ts        NEW — acquire/release, capability-checked
src/main.tsx
DELETE: src/ui/SettingsScreen.tsx and its test
```

## Files you must NOT touch

`src/domain/**` (brief 15), `src/persistence/**` (brief 16), `server/**` (brief 17),
`src/ui/figures/**` and `src/ui/ExerciseFigure.tsx` (brief 18 — **render it, don't edit
it**). If any of their APIs are wrong for you, report BLOCKED with the exact signature
you need rather than reaching across.

## The stack

**Base UI is `@base-ui/react`** — not `@base-ui-components/react`, which is stuck at an
ancient release candidate. Use it wherever it fits. **TanStack Router** for the four
routes and **TanStack Query** for the state document, so a mutation on `/` invalidates
what `/account` reads without a manual refresh.

## 1. `/` — home, then the player

Home shows today's session: the slot label, the exercises with their targets, and
**three variant buttons — easy · medium · hard**. Tapping one starts the session.
The variant changes reps or seconds only; it does not change which exercises appear.

Then the player, which is the heart of the app:

- **One page per exercise.** The animated figure, the movement name, the target number
  large and in tabular numerals, the cues, and **three dots** (two for the daily core and
  posture block, five for the cardio round).
- **Tapping Next fills a dot.** The last tap advances to the next exercise. Rest is
  simply however long the user takes before tapping — **there is no rest timer**, because
  a rest timer would be the app measuring something.
- **On a timed exercise**, a start button runs a countdown ring. It is **orientative and
  gates nothing** — Next is live from the moment the page appears, whether or not the
  ring was ever started or finished. Anything that disables Next is a bug against the
  governing decision.
- **The player's position lives in the URL** (a search param on `/`), so a reload
  mid-session and the back button both behave. Deviate only with a stated reason.
- Then a finish page. It says the session is done and it does **not** ask anything.

### Two content requirements that are safety requirements

- **On a rung with `safetyCritical: true`, the first cue renders first and visually
  separated** — its own block, not item one of four in a list. The schedule reaches
  these rungs on a clock rather than on readiness, and the cue text is the only brake
  the user chose to have. See
  [decisions.md](../../wiki/decisions.md#accepted-risk--the-schedule-prescribes-risky-rungs-on-time-not-on-readiness).
- **The pull ladder's `POSTURAL_NOTICE` must be surfaced** wherever a pull exercise is
  shown. Presenting postural work as pulling strength is a misrepresentation with a
  physical consequence, and the wording already exists — use it verbatim.

## 2. `/week` — the next seven sessions

Seven cells laid out like a week, showing the coming sessions with their exercises and
targets. **No dates. No day names. No "today" that means a calendar day.** It is a plan
of the next seven *sessions*, and it must read identically whether the user trains
tomorrow or in three weeks.

## 3. `/account`

The username, the milestones reached, and total work ever — all three from brief 20's
domain functions. **Not a chart**: a fixed schedule plotted against session number is a
straight line containing no information. If you find yourself wanting one, that's the
design being honest, not a gap.

State plainly, where a pattern has reached its top rung, that it has reached the ceiling
of what floor-only training offers and that the target now cycles. That is a real
finish, not a failure, and the copy should say so without hedging.

## 4. `/login`

Username and password. **The copy says the password is not checked** — the app stores
training data on a personal deployment, anyone who knows a username can read it, and
pretending otherwise would be the actual dishonesty. One or two plain sentences; do not
dress it up and do not apologise for it.

It must work **offline**, which it trivially does because there is nothing to verify.

## 5. The two mechanical invariant tests

Carried forward from brief 14. These are the point of the brief as much as the screens
are:

1. **No dates anywhere in `src/ui/`.** A test that greps the built `src/ui/` tree for
   date formatting — `toLocaleDateString`, `toLocaleString`, `Intl.DateTimeFormat`,
   `getMonth`, `getDay`, `new Date(` — and fails on a hit. History stores `completedAt`;
   nothing in the UI may read it.
2. **The home page renders identically whether the last session was 1 day or 400 days
   ago.** Render with two state documents differing only in history timestamps and assert
   the DOM is byte-identical. This is the guilt-free property, and a test is the only
   thing that keeps it true as features land.

## Acceptance

- `npm run check` (typecheck + lint + tests) clean across the whole tree.
- `npm run build` emits a working service worker; the app is installable and the
  session-critical path works offline.
- The two invariant tests above, passing.
- A test asserts **Next is enabled on a timed exercise before the countdown is started
  and after it is abandoned** — the single most important behavioural test here.
- A test asserts choosing `easy` and completing a session advances `sessionsDone`
  exactly as `medium` would.
- A test asserts a `safetyCritical` rung renders its first cue in a separate element from
  the remaining cues.
- A test asserts a pull exercise renders `POSTURAL_NOTICE`.
- A test asserts a reload mid-session resumes on the same exercise.
- **Open it in a real browser at phone width and use it.** Tap through a full session of
  each of the three slots. Report what felt wrong — this is the first time the design has
  been touched rather than read, and the report is worth as much as the code.
