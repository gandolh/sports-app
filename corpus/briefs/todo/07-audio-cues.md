# Task 07 — Audio cues

## Context

The point of audio is to let you **put the phone down**. If the app can call out
sets and rest transitions, you stop looking at a screen on the floor and the
ergonomics improve more than any visual change could.

Two mechanisms, deliberately unequal in priority
([decisions.md](../../wiki/decisions.md)):

- **A WebAudio oscillator beep is the primary cue.** It is reliable, instant, needs
  no assets, and never fails to be available.
- **`speechSynthesis` is best-effort enrichment.** Voice availability varies across
  iOS and Android, and on some devices voices load asynchronously or not at all.
  **Nothing may be speech-only** — if speech silently fails, the session must remain
  fully usable on beeps alone.

## Files you OWN

```
src/session/audio.ts
src/session/__tests__/audio.test.ts
```

Plus **minimal** wiring in `src/ui/PlayerScreen.tsx` and a mute/voice toggle in
`src/ui/SettingsScreen.tsx`.

## Files you must NOT touch

`src/domain/**`, `src/persistence/codec.ts`, `src/persistence/store.ts`. Do not
restructure `useSession.ts` — subscribe to the events brief 06 already emits.

## What to do

1. **`audio.ts`** exposes `beep(kind)` and `say(text)`, plus `init()` and
   `setEnabled(flag)`.
2. **Unlock the audio context on the Start tap.** Browsers require a user gesture
   before audio plays, and Start is the last guaranteed gesture before the phone goes
   on the floor. Create/resume the `AudioContext` there. Missing this is the classic
   failure where every cue is silent for the entire session with no error.
3. Beeps: a short mid-tone for **rest ending soon** (3s warning) and a distinct
   double-tone for **rest over, next set**. Keep them under 300ms and well under a
   comfortable volume ceiling — this fires next to your head at 7am.
4. Speech, attached to brief 06's events: announce the next exercise and target at
   `exerciseChanged` ("Next: full push-ups, eight reps"), and a brief "go" at
   `restFinished`. **Do not** narrate every set — it becomes noise fast, and the beep
   already carries the timing.
5. **Guard speech behind a real availability check**, not just
   `'speechSynthesis' in window`: verify `getVoices()` eventually returns a non-empty
   list (it populates asynchronously — handle `voiceschanged`), and time out after a
   second or two. If unavailable, fall back to beeps silently and record the fact in
   settings so the toggle can explain itself rather than appearing broken.
6. Cancel any queued speech on `sessionFinished` and on unmount. A stale utterance
   announcing set 3 after you've finished is worse than silence.
7. Settings: **Sound on/off** and **Voice on/off** as separate toggles, persisted.
   Voice is the one people tire of first; forcing them to lose the beep to escape the
   voice would be a bad trade.

## Acceptance

- `npm test` passes with `AudioContext` and `speechSynthesis` stubbed. Tests assert:
  cues are no-ops when disabled; speech is skipped when `getVoices()` stays empty;
  queued speech is cancelled on finish.
- Manual on a phone: run a session with the screen off after Start and confirm rest
  transitions are audible without looking. **Report whether speech worked on the
  actual device** — this is the fallback path that matters.
- Manual: with Voice off and Sound on, timing cues still fire.
- No changes to `src/domain/`.
