---
summary: What the training actually is — the three-day rotation, what each session contains, the rep ladders rung by rung (with brief 28's three in-between rungs), the per-rung hold caps, and the cardio protocol.
updated: 2026-10-07
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

The `#` is the number in the rung's id, which never changes. The app's "rung 4 of 9"
counts by position instead, so the two differ above a gap or an inserted rung. **S** is
where every document starts; **!** is `safetyCritical`; **new** is brief 28.

| # | Push | # | Squat | # | Hinge |
|---|---|---|---|---|---|
| 01 | Wall push-up | 01 | Assisted squat, fingertips on a wall | 01 | Glute bridge |
| 02 | Knee push-up, knees under hips | 02 | Bodyweight squat **S** | 02 | Glute bridge, 2s hold at the top **S** |
| 03 | Knee push-up, knees set back **S** | 03 | Squat, 3s lowering | 03 | Single-leg glute bridge |
| 3a | Slow-lowering push-up, press up from the knees **new** | 04 | Squat, 3s lowering + 2s bottom hold | 04 | Single-leg bridge, heel far out |
| 04 | Full push-up | 05 | Heels-elevated squat, deeper range | 4a | Sliding leg curl, halfway out **new** |
| 05 | Full push-up, 3s lowering | 5a | Split squat, one hand on a wall **new** | 05 | Sliding leg curl, both legs |
| 06 | Full push-up, 3s lowering + 2s bottom hold | 06 | Split squat | 06 | Sliding leg curl, 5s slide out |
| 08 | Diamond push-up (07 retired, see below) | 07 | Assisted single-leg squat **!** | 07 | Single-leg sliding leg curl |
| 09 | Archer push-up **!** | 08 | Pistol squat progression **!** | | |

Push has no rung 7: `push-07-feet-elevated` needed a chair, and a pike push-up would
be a different exercise. The gap is deliberate (`ladders.ts`).

### The three in-between rungs

*Added 2026-10-07 by brief 28, answering open question 7.* At three places the next
rung at 5 reps was much harder than the last one at 12, so its first session was often
its hardest while the app drew a smooth ramp. The owner is new to exercise and asked
for the best option at each step, so each was chosen for a beginner:

- **Push 3a, slow-lowering push-up.** Lowering is easier than pushing, so a beginner can
  control a full push-up on the way down before they can press one up. This rung does
  the full push-up's lowering over three seconds, then sets the knees down and presses
  from there. One movement, a tempo modifier, and the knee push-up's leverage for the
  half they cannot do yet. A standard route to a first full push-up.
- **Hinge 4a, sliding leg curl halfway out.** Rung 4 to rung 5 asked for two new things
  at once: the slide itself, and a long, loaded lever at its far end. The half slide
  teaches the slide while the knees stay bent and the lever is short; rung 5 then adds
  only range. Like the rest of this ladder, it fails by the hips dropping, so it is not
  `safetyCritical`.
- **Squat 5a, split squat with a hand on a wall.** Two legs to one adds load per leg and
  a balance problem in the same step. The hand takes the balance away, so the first
  split-squat rung trains the legs; rung 6 then only takes the hand off. Rung 7 already
  uses a hand on a wall, so the ladder's language does not change.

Each is zero equipment (towels and a wall), states its tempo, and says in its cues what
changed from the rung before. The cues call them rung 3a, 4a and 5a, after their ids.
Adding a rung moves every rung above it up one array index, which is why brief 28 also
carried a state migration; see [progression-engine.md](progression-engine.md).

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
