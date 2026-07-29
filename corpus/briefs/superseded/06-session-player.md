# Task 06 — Session player

## Context

The screen the app actually is. Everything else is support.

The governing constraint, from [`SPEC.md`](../../../SPEC.md): mid-workout you are
breathing hard, your hands are sweaty, and the phone is on the floor two metres
away. **Every tap is expensive.** A layout that is pleasant on the couch is
unusable during a set. Budget is roughly **eight taps for a whole session**.

Read [architecture.md](../../wiki/architecture.md) — `session/` is the only place
browser capabilities are touched, each behind a capability check with a working
no-op fallback.

## Files you OWN

```
src/session/useSession.ts     player state machine
src/session/timer.ts          timestamp-based elapsed
src/session/wakeLock.ts
src/ui/PlayerScreen.tsx
src/ui/HomeScreen.tsx
src/session/__tests__/*
```

## Files you must NOT touch

`src/domain/**`, `src/persistence/**`. No audio — brief 07 owns `audio.ts` and will
hook into the events you emit. No warmup — brief 08.

## What to do

1. **`timer.ts` — timestamp-based, non-negotiable.** Store `restStartedAt` and
   compute elapsed as `now − restStartedAt` on every tick. **Never accumulate
   `setInterval` ticks.** Backgrounded tabs throttle intervals to once a minute or
   stop them entirely, so an accumulating timer silently under-counts and the guided
   loop breaks. Returning to the foreground must show the *correct* elapsed time,
   including "rest already finished".
2. **`wakeLock.ts`** — acquire `navigator.wakeLock.request('screen')` when a session
   starts, release on finish or unmount, and re-acquire on `visibilitychange` back to
   visible (the lock is dropped automatically when the page hides). Every path behind
   a capability check; unsupported browsers get a no-op and the session still works.
3. **`useSession.ts`** — a state machine over
   `idle → work → rest → work … → summary`. It holds the `Prescription` from
   `nextSession()`, accumulates `SetResult`s, collects the effort rating, and emits a
   `SessionResult` for `applySession()`. Emit named events (`setCompleted`,
   `restStarted`, `restFinished`, `exerciseChanged`, `sessionFinished`) so brief 07
   can attach audio without you importing it.
4. **`HomeScreen.tsx`** — shows the cycle day and its patterns, `sessionsCompleted`,
   and one large **Start** button. **No calendar, no streak, no heatmap, no
   "last trained N days ago"** — that framing is a locked decision
   ([decisions.md](../../wiki/decisions.md)). Returning after two weeks must look
   identical to returning after one day.
5. **`PlayerScreen.tsx`** — per set, full-screen and legible at arm's length:
   - exercise name, the **rung's cues**, and `<ExerciseFigure>` (brief 10 — render
     its placeholder for now),
   - the target rendered large, and **`Last time: 3×7`** beside it,
   - one **huge Done button** — the primary and usually only interaction. Size it for
     a sweaty thumb aimed from a metre away, not for a mouse.
   - the target value is **tappable** → a stepper pre-filled at target for logging a
     miss. Two taps, and only when you actually failed.
   - rest: a large countdown with a visible progress ring, plus **Skip rest**.
   - after an exercise's last set: a one-tap effort choice — `easy | ok | hard`.
6. **`summary`** state → call `applySession`, save via brief 05's store, then show
   what changed: any rung advance, any target bump. This is the payoff moment; make
   the advance legible ("Push: now at *full push-up*, 3×5"). If a ladder is maxed,
   say so.
7. Handle **abandonment**: leaving mid-session must not write a partial
   `SessionResult` and must not advance the cycle. Prefer discarding over persisting
   a half-session — a phantom completed session corrupts the engine's counters, which
   is worse than losing one workout's data.

## Acceptance

- `npm test` passes. Tests cover the state-machine transitions, and specifically:
  the timer reports correct elapsed after a simulated 90-second gap in ticks; a
  session abandoned mid-way produces no state mutation.
- Manual on a phone: complete a full session in **≤10 taps** (count them and report
  the number). If it exceeds ten, the layout needs another pass before this is done.
- Manual: lock the screen mid-rest, wait past zero, unlock — the app shows rest as
  finished with correct elapsed, not a stalled countdown. **Report actual observed
  behaviour**, including whether the wake lock held; this is open question 4 in
  [open-questions.md](../../wiki/open-questions.md).
- Completing a session advances `cyclePosition` and `sessionsCompleted` exactly once.
- Wake-lock and stepper paths work in a browser where `navigator.wakeLock` is absent.

---

## SUPERSEDED 2026-07-29 — the v2 grill

The adaptive engine this player fed no longer exists. It was built around a rest
timer, a big Done button per set, and an effort tap — all three are gone. Its
replacement is **brief 19**, whose player is one page per exercise with three dots and
an orientative countdown that gates nothing.
