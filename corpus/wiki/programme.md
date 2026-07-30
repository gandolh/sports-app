---
summary: What the training actually is — the three-day rotation, what each session contains, the per-rung hold caps, and the cardio protocol.
updated: 2026-07-30
---

# The programme

The *shape* of the training. [decisions.md](decisions.md) records why these calls were
made; [progression-engine.md](progression-engine.md) records how the numbers move;
this page is what a session contains. Split out of `decisions.md` on 2026-07-29 when
that page passed the 200-line cap.

## The rotation

```
Push day     push        + core + posture      3 exercises   ~12 min
Legs day     squat hinge + core + posture      4 exercises   ~16 min
Cardio day   intervals   + core + posture      3 exercises   ~14 min
```

Three positions, rotating, one per training session. **The position is an integer
counter, never a date.**

Strength patterns run **3 sets**; the daily core and posture block runs **2**, to keep
sessions near twelve minutes. Legs day is the long one — accepted.

### Why this order

**Cardio always follows legs and never precedes it.** With daily training you cannot
avoid cardio landing adjacent to legs day unless legs days go back-to-back, which
breaks 48-hour recovery — so the achievable optimum is the *order*. The
concurrent-training literature cares about strength-before-conditioning, and
`Legs → Cardio → Push` satisfies it while giving legs 48h+ before the next session.

**The core and posture block is daily** because that work is low-fatigue, responds to
frequency, and is the half of the goal set a desk job actively damages. It also
equalises pacing: at one session per rotation, core rungs took twice as long as push
rungs to clear.

### Volume it produces

| Pattern | Sessions/week | Direct sets/week |
|---|---|---|
| Push · squat · hinge | 2.3 | ~7 |
| Core · posture | 7 | 14 |
| Cardio | 2.3 | — |

~7 sets/week per strength pattern is the "clearly working but sub-maximal" band.
Frequency effects are negligible once volume is matched, so if more is ever wanted the
lever is **a fourth set, not a fourth session** — at the cost of ~100s, which breaks
the twelve-minute budget. A real trade-off, not a free win.

## Hold caps, per rung

Timed rungs carry **their own** `targetMin` / `targetMax` rather than inheriting one
range per ladder, because the evidence-based ceilings differ per exercise:

| Exercise | Range |
|---|---|
| Front plank | 20 → 60s |
| Side plank (**total**, split evenly between sides — so 15 → 45s *each*) | 30 → 90s |
| Hollow hold | 15 → 45s |
| Tuck L-sit | 10 → 30s |
| Prone Y / T | 10 → 30s |
| Y-T-W combo · reverse snow angel · prone lat slide | 20 → 45s |

Rationale in [training-science.md](training-science.md#isometric-holds-have-a-ceiling-and-it-is-low):
McGill programs 10-second holds, transfer drops sharply past 60s, and the L-sit is
limited by the wrists rather than the abdominals.

**The side plank is the one row that is a total rather than a per-exercise dose, and it
took two passes to get right.** The row said "per side" until 2026-07-29, when it was found
to contradict the code: the rung's own cue splits one clock evenly between sides, so the
then-current 45-second cap was ~22s each — roughly half the published side-bridge norms of
65–97s per side. That was a documentation fix, and it left the *cap* itself open as
question 6.

**Resolved 2026-07-30: the cap rose to 30 → 90s total**, which is 15 → 45s on each side and
lands inside the norms. It is deliberately the only rung above the 60s ceiling the front
plank respects, and that is not an inconsistency — no single side is ever held longer than
45s. The rung's third cue now states outright that the number on the clock is the total, so
the display cannot be misread as a per-side prescription.

The interpolation in [progression-engine.md](progression-engine.md) handles differing spans
without needing a per-rung step, so re-tuning any of these costs nothing.

## Rep ladders

All three run 5 → 12. **Reps cap at 12** because past ~12–15 bodyweight reps the
adaptation drifts from strength to endurance and there is no load to add. At the cap
the lever switches to the next modifier — tempo, pause, range, leverage, unilateral.

## The cardio day

**5 rounds hard / easy, lower-body, floor only, one room.** High knees or fast
bodyweight squats. In the player it is one page with five dots: tap the start button
for the orientative countdown, go hard, then rest as long as you like before tapping
Next. The easy interval is simply the time before the next tap.

Three constraints, each with a reason:

- **60-second intervals, not 20.** Short-interval HIIT beats nothing but loses to
  longer intervals — 4×4min gave 6.5% VO2max against 3.3% for 8×20s.
- **Lower-body movements only.** The push day is upper-body and the core/posture block
  is daily, so burpees and mountain climbers would collide with both.
- **Intensity is the active ingredient, not reps or speed.** A high-rep set on an easy
  movement ends when the muscle quits, not when the cardiovascular system is taxed —
  that is a pressor response, not aerobic training. Tabata's own author published a
  note that copying 20/10 intervals while dropping the intensity requirement yields no
  VO2max improvement.

**Honest limit the app must state:** this reaches roughly **20–45% of the guideline
aerobic minimum**. Fitness gains are largely achievable; the volume-dependent benefits
(blood pressure, lipids, the dose-response mortality curve) are not.

## The pull slot is postural, and the app says so

v1 has no anchor, so the pull slot trains scapular retraction and upper-back endurance
— the posture half of the imbalance — and nothing else. `Ladder.kind` is `'postural'`
rather than `'strength'`, required rather than optional so it cannot be forgotten, and
`POSTURAL_NOTICE` is the wording the UI must surface.

Presenting this as pull strength would be a safety misrepresentation: **lats, elbow
flexors and grip receive no meaningful stimulus.** Prone Y-T-W raises are real
mid-trapezius work and do essentially nothing for the lats.
