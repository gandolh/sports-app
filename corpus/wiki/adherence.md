---
summary: What the app assumes about the person using it — bad days, skipped days, rungs that are too hard, and the daily block that is easiest to drop.
updated: 2026-07-30
---

# Adherence and accepted risk

Split out of [decisions.md](decisions.md) on 2026-07-30 when that page passed the
200-line cap for the second time. These four are **product decisions like any other** —
they are not softer or more provisional — but they share one subject: the app's model of
a real person rather than an ideal one.

Every one of them follows from
[the governing decision](decisions.md#the-governing-decision--the-app-measures-nothing).
Because the app measures nothing, it cannot detect a bad day, a skipped day, a rung the
user cannot perform, or a block being quietly dropped. It has to decide in advance what
it assumes about each, and then never ask.

**Three of the four were settled by the user on 2026-07-30**, closing open questions 1, 2,
3 and 5. See [`../log.md`](../log.md) for the exchange.

## Easy / medium / hard, picked per session, reps only

*Chosen 2026-07-29, reversing "no effort input anywhere" (below) — but only as a
**load dial**, never as a signal.*

The home page offers today's training in three variants. The pick changes the target
by **−2 / 0 / +2 reps** (floored at 3; **hard is a no-op at 12**) or the equivalent
seconds tier for holds, and nothing else. Sets, movements and rungs are identical.

**The pick has no effect on the schedule.** An easy day banks no debt and costs no
progress; tomorrow's prescription is what it was always going to be. This is the
whole point — a bad day must be free.

The pick *is* recorded in history, because it is the only genuinely variable input in
the app and the account page has nothing else to work with.

### SUPERSEDED — "no effort input anywhere"

v1 removed both the post-set effort tap and a pre-session difficulty picker because the
engine read them badly. **The engine no longer reads anything**, so a picker that feeds
nothing cannot corrupt anything. The rejection of the *post-set* tap stands permanently:
asking after the work is asking at the worst possible moment.

## Accepted risk — the schedule prescribes risky rungs on time, not on readiness

*Decided by the user 2026-07-29 against the recommendation. Recorded, not relitigated.*

With no adaptation, the schedule reaches the hollow hold at ~3 months, the hollow rock
at ~4, the tuck L-sit at ~5.5, the assisted single-leg squat at ~7, and the archer
push-up and pistol progression at ~8 — regardless of whether the user can perform them,
and with no mechanism to step back.

**The nordic negative is no longer on that list** — it was the sharpest item when the
decision was taken, and brief 15 removes it because the couch anchor violates the
floor-only constraint. The hinge ladder now has no injurious rung at all.

Four mitigations were offered (cut the rungs, a one-time unlock, a manual rung control,
or nothing) and the user chose to rely on the rungs' own cue text, which already opens
with an explicit safety check and a stop signal. The one consequence that follows:
**on flagged rungs the safety cue renders first and visually separated**, not as item
one of four.

**Confirmed and sharpened 2026-07-30**, closing open questions 2 and 3. Asked whether
the cue text is a strong enough brake and whether the squat ladder needs an intermediate
rung before the split squat, the user answered: *"It's ok if it gets difficult"* and
*"If it's dangerous, the player can skip it by pressing next."*

So the brake is **Next**, not the prose. That is a stronger mitigation than the one
originally recorded, and it costs nothing to exercise: the app measures nothing, so
skipping an exercise has no consequence anywhere — no debt, no flag, no effect on
tomorrow. **No feature may ever make skipping expensive**, because that is what this
mitigation rests on. In particular, nothing may count skips, warn about them, or show
them on `/account`.

The intermediate squat rung is **not** being added. The remaining reason to consider one
is [open question 7](open-questions.md), which is a different complaint — that the
interpolation misstates *where* difficulty sits inside a rung — and would need its own
justification.

## Skipping days is expected, and the six-week pace does not assume otherwise

*Decided by the user 2026-07-30, closing open question 1: "Don't make assumptions about
continuity. I will try to do it daily, but there might be some days when i skip. After i
skip, i will go to the next session in the queue."*

This is the answer to the sharpest thing brief 15's implementer found: **"a rung takes
six weeks" silently assumes daily training.** 14 sessions is 2.3/week × 6, so at three
sessions a week a push rung takes ~14 weeks and the whole ladder runs to about two years.
The app has no dates and cannot notice.

The user's answer is that **there is nothing to notice.** "Six weeks" is not a promise the
app makes; it is the arithmetic that produced the step size, and the step size is what
actually ships. The queue is the contract: skip a day, open the app, get the next session.
That is exactly what [no dates anywhere](#no-dates-anywhere-in-the-app) already
guarantees, so no code changes.

**What this forbids:** any feature that would need to know the gap between sessions —
"you've been away a while", a re-entry deload, a pace estimate, a projected finish date.
All of them require reading `completedAt` from the UI layer, which is already banned. This
decision is why that ban is a product rule and not just a tidiness rule.

`SESSIONS_PER_RUNG_ROTATING` (14) and `SESSIONS_PER_RUNG_DAILY` (42) stay as they are, and
remain re-tunable without invalidating stored state.

## The daily core and posture block stays daily

*Decided by the user 2026-07-30, closing open question 5: "yes, it's important to have
some exercises for daily posture and core."*

The question was whether two extra exercises at the end of every session, forever, survive
contact with real use — and the app cannot tell when they are skipped, so the schedule
advances those ladders regardless.

Kept, at full frequency. The three alternatives that were on the table are all now
**rejected**: shortening it to one set, moving it to alternate days, and moving it ahead of
the strength work. The last one is worth naming explicitly, because it looks like a free
improvement — putting it first would protect it from being dropped, but it would also put
low-intensity holds in front of the session's main strength work, which the
concurrent-training ordering in [programme.md](programme.md) exists to prevent.

Combined with the Next-is-the-brake decision above: the block is skippable per session and
that is fine. What is not on the table is making it *structurally* less frequent.
