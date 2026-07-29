---
summary: Only the genuinely unresolved. Answered questions are deleted from here, not archived.
updated: 2026-07-29
---

# Open questions

Delete an entry the moment it is answered — its history belongs in
[`../log.md`](../log.md), not here. This page is only trustworthy if it contains
nothing settled.

## 1 — ANSWERED, and the premise was wrong

*Asked: does the `easy` fast-track over-advance the time-based ladders?*

**Both halves of the question were mistaken.** Measured across 8 seeds:

- **The fast-track was not the cause.** Disabling it recovered under 10% of the
  over-advance. Removing the effort input entirely made it marginally *worse*
  (605 → 633 of 2400), because the input's real contribution was the *hold* it enabled
  ("every rep done but rated hard → repeat"), which stopped the climb one step short of
  failure.
- **It is not a time-ladder pathology.** The same capability curve gives 502/3600 (13.9%)
  on rep ladders. Time ladders are ~2× worse for an arithmetic reason — a 5s step across
  20–45s overshoots proportionally more than a 1-rep step across 5–12.

Superseded by question 5 below, which is the real problem this was a symptom of.
See [progression-engine.md](progression-engine.md).


## 2 — Is the form-cue text good enough to distinguish adjacent rungs?

Since rungs now differ by *tempo and pause* rather than by shape, a figure cannot
tell rung 3 from rung 4 — only words can. "3s down + 2s pause" is meaningless, and
possibly unsafe, unless the card says *where* the pause happens.

If the cue text is sloppy the rungs become indistinguishable in practice and
progression turns into placebo. This is a content-quality risk, not a code risk,
and it is the most likely way the engine gets quietly undermined.

**How we'll answer it:** review brief 03's cue text specifically for
rung-discriminability, then check whether sessions at adjacent rungs actually feel
different.

## 3 — Will the squat ladder stall at the split-squat jump?

Rungs 1–5 progress smoothly via tempo, pause, and range. Rung 6 (split squat) is a
genuine step change in both difficulty and coordination, and rung 7 (assisted
single-leg) more so. The engine's regress rule will catch a stall, but a ladder
with one impassable rung is a content bug the engine cannot fix.

**How we'll answer it:** watch for repeated hold/regress cycling at rung 5→6. Fix
would be an intermediate rung, not an engine change.

## 4 — Does `navigator.wakeLock` behave on the actual target device?

The design treats the wake lock as the mechanism that keeps the rest timer alive
and audible. Support is real in Chrome and Safari 16.4+, but behaviour under a
manual screen-off, an incoming call, or app backgrounding is not verified. The
timestamp-based timer means elapsed time stays *correct* regardless — the open
question is whether the **audible cue** still fires.

**How we'll answer it:** manual test on the phone during brief 06. Fallback if it
fails: on returning to foreground, reconcile elapsed time and skip forward rather
than replaying cues.

## 5 — The engine has no interior fixed point

**Measured, not speculative.** With no effort input there is no "completed but hard → hold"
rule, and that was the engine's only interior fixed point. A static-capability user
therefore **oscillates over two adjacent rungs** instead of settling: climb to the top of a
rung → advance → fail 3× → deload → re-climb in 2 sessions → advance → fail again.

Tail bands are identical across 8 zero-noise seeds — push `[5,6]`, squat `[5,6]`, core
`[3,4]`, pull `[3,4]` — so it oscillates rather than wanders, but it costs 0–37.5% of tail
sessions to a missed target. Hinge `[5]` is the only true fixed point, and only because it
sits at the top of its ladder.

**The fix that needs no user input: hysteresis.** Track deloads per rung and raise the
advancement requirement each time the same rung is failed, so the bar rises until the user
genuinely clears it. Not yet implemented — it is an engine rule change and therefore the
user's call.
