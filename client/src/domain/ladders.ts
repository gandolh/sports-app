/**
 * The five ladders plus the cardio protocol, as data. Content, not logic —
 * `schedule.ts` only ever asks this file "what is rung N of pattern P, and what
 * is its target span".
 *
 * ── RUNG IDS ARE IMMUTABLE ONCE SHIPPED ─────────────────────────────────────
 *
 * Every `id` below is written verbatim into `SessionResult.history` in the
 * persisted state document. **Renaming one orphans real training records**: the
 * history entry keeps the old string, nothing in `LADDERS` matches it, and every
 * account-page total silently loses that exercise. Adding a rung is fine;
 * renaming or reusing an id is not. **A rung whose movement changes gets a NEW
 * id** — that is why the floor-only fix below retired `push-01-hands-high`,
 * `push-02-hands-low`, `push-07-feet-elevated`,
 * `hinge-04-single-leg-feet-elevated`, `hinge-05-nordic-negative` and
 * `hinge-06-nordic-negative-long-eccentric` rather than repointing them, and why
 * `findRungById` must keep returning `undefined` for them instead of throwing.
 *
 * Convention (asserted in the tests): `<pattern>-<NN>-<slug>`, where `NN` is the
 * rung's 1-based position zero-padded to two digits and `slug` is lower-kebab.
 * `schedule.ts` indexes by array position and never parses an id, so `NN` is for
 * humans reading a hand-edited state file — and for the cue text, where "rung 6"
 * means the rung numbered `06`.
 *
 * **`NN` therefore records the position a rung SHIPPED at, not its current array
 * index**, and the two diverge the moment a rung in the middle is retired. The
 * push ladder is the live case: rung 7 is gone, so `push-08-diamond-hands` sits at
 * index 6. Renumbering it would rename an id, which is the one thing that is never
 * allowed. The tests assert `NN` is unique and strictly increasing within a
 * ladder, not that it equals `index + 1`.
 *
 * ── FLOOR ONLY. TOWELS AND THE FLOOR ────────────────────────────────────────
 *
 * Zero equipment means zero *furniture* too: no chair, couch, sofa, bed, stair,
 * doorframe, table, counter or windowsill in any cue. A test greps for exactly
 * those words and fails on a hit. Walls, folded towels, blankets and a book are
 * the whole prop list — they are what every room has and what nobody has to buy.
 *
 * ── WHY THE CUES ARE THIS LONG ──────────────────────────────────────────────
 *
 * A rung is *one movement plus a modifier*, so adjacent rungs share a pose and a
 * figure. Rung 3 and rung 4 of the squat ladder look identical in a drawing. Only
 * the cue text can distinguish them, and if it fails to, the user performs both
 * the same way and progression becomes placebo. So each rung's cues cover:
 *
 *   1. setup — hand/foot position, and on a `safetyCritical` rung the safety
 *      check, because `cues[0]` is what brief 19 renders first and separated
 *   2. movement standard — where the rep starts and ends
 *   3. the modifier, **located inside the rep** — never "3s down + 2s pause",
 *      always "three seconds down, then hold still two seconds at the bottom"
 *   4. the failure signal — the sentence that says *stop the set*
 *
 * Two conventions follow from that and are deliberate, not verbose:
 *
 *   - **Every rung states its tempo explicitly, even when the tempo is normal.**
 *     Silence about tempo is how a modifier leaks forward into a rung that should
 *     not carry it (push 8, squat 6) or gets dropped from one that should
 *     (squat 5). "Steady tempo, no pause" is information.
 *   - **A rung whose only difference from its neighbour is a pause or a count
 *     names that neighbour and says what changed.** "Rung 4" means the rung
 *     numbered `04` in its id — the same 1-based number a person sees in the state
 *     file. A cross-reference never *replaces* an absolute instruction, because
 *     the card on screen only ever shows the current rung: every rung restates
 *     its own setup and its own tempo in full.
 *
 * `figureId` names one of the five base pose pairs (push · squat · hinge · prone ·
 * plank). Rungs within a ladder share one pose by design; the per-rung difference
 * is an overlay plus the cues above.
 */
import type { CardioProtocol, Ladder, Rung } from './types.ts'
import type { Pattern, Range } from '@sports-app/shared/types.ts'

// ─── The law: how long a rung takes ─────────────────────────────────────────

/**
 * **A rung takes about six weeks, on every ladder.** These two numbers are that
 * sentence, not tuning knobs: `sessions of the pattern per week × 6`.
 *
 * A rotating pattern (push, squat, hinge) is trained once per three-slot rotation
 * — 2.3×/week at one session a day — so 14. The daily block (core, pull) is
 * trained 7×/week, so 42. Read as bare numbers they look arbitrary; they are the
 * only two values consistent with the law (corpus/wiki/progression-engine.md).
 *
 * Re-tuning either is the *one* number in the programme with no evidence behind
 * it (corpus/wiki/open-questions.md #1), and it is deliberately cheap to change:
 * nothing stored depends on it, so a re-tune moves everyone's target without
 * invalidating a single persisted record.
 */
export const SESSIONS_PER_RUNG_ROTATING = 14
export const SESSIONS_PER_RUNG_DAILY = 42

// ─── Target spans ───────────────────────────────────────────────────────────

/**
 * All three rep ladders run 5 → 12. **Reps cap at 12** because past ~12–15
 * bodyweight reps the adaptation drifts from strength to endurance and there is
 * no load to add; at the cap the lever switches to the next modifier.
 */
const REPS_5_12: Range = { min: 5, max: 12 }

/**
 * Hold spans, per exercise rather than per ladder, because the evidence-based
 * ceilings differ: McGill programs 10-second holds, transfer drops sharply past
 * 60s, and the L-sit is limited by the wrists rather than the abdominals
 * (corpus/wiki/programme.md#hold-caps-per-rung). The interpolation absorbs
 * differing spans for free, so re-tuning any one of these costs nothing.
 */
const SEC_20_60: Range = { min: 20, max: 60 }
const SEC_15_45: Range = { min: 15, max: 45 }
const SEC_20_45: Range = { min: 20, max: 45 }
const SEC_10_30: Range = { min: 10, max: 30 }

/**
 * `<pattern>-<NN>-<slug>`. Exported so the tests and any future validator check
 * the same rule rather than two drifting copies of it.
 */
export const RUNG_ID_PATTERN = /^(?:push|squat|hinge|core|pull)-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What the UI must show alongside any ladder with `kind: 'postural'`. There is no
 * anchor, so the Pull slot trains scapular retraction and upper-back endurance —
 * the posture half of the imbalance — and nothing else. Saying so is a locked
 * decision with a safety rationale: presenting postural work as pull strength is
 * the misrepresentation that does real damage (corpus/wiki/programme.md).
 */
export const POSTURAL_NOTICE =
  'Postural work, not pulling strength. With no bar or anchor, horizontal pulling ' +
  'cannot be trained at home — this slot builds the upper back and shoulder-blade ' +
  'control that sitting takes away. The gap is real and this app does not pretend ' +
  'otherwise.'

// ─── PUSH — every rung is a push-up ─────────────────────────────────────────

const PUSH_RUNGS: readonly Rung[] = [
  {
    // Was `push-01-hands-high`, a counter/windowsill push-up. New movement, new id.
    id: 'push-01-wall',
    name: 'Wall push-up',
    figureId: 'push',
    modifier: { elevation: 'hands' },
    cues: [
      'Stand facing a wall two of your own foot-lengths back, feet hip-width, and place your hands flat on the wall at chest height, a little wider than your shoulders. Squeeze your glutes so you are one straight line from heel to head.',
      'Bend your elbows and let your chest travel in until it is a hand\'s width from the wall, then push until your elbows are straight. Chest close to the wall is the rep — a short push does not count.',
      'Steady tempo: about one second in, one second out, and no pause at either end. This rung has no tempo modifier. Step your feet further back to make it harder, closer to make it easier.',
      'Stop the set the moment your hips sag or your lower back arches, even if your arms still feel fresh — that is failure of the plank, which is half of a push-up.',
    ],
  },
  {
    // Was `push-02-hands-low`, a chair/stair push-up. New movement, new id.
    id: 'push-02-knees-short-lever',
    name: 'Knee push-up, knees under your hips',
    figureId: 'push',
    cues: [
      'On the floor: hands flat under your shoulders, knees down directly beneath your hips so your thighs are nearly vertical, one straight line from knee to head with no bend at the hip.',
      'Lower until your chest is a fist deep off the floor, then press back to straight elbows. Chest to a fist off the floor is the rep.',
      'Steady tempo, about one second down and one second up, with no pause at the bottom. Rung 1 had you upright against a wall; here you are on the floor, but with your knees tucked in close so your arms carry less of you than they will on rung 3.',
      'Stop the set when your hips sag toward the floor, your back arches, or your chest stops reaching a fist off the floor.',
    ],
  },
  {
    // Id fixed by history — do not rename. Cue 3 and the name changed when rung 2
    // stopped being a chair push-up; the movement did not.
    id: 'push-03-knees',
    name: 'Knee push-up, knees set back',
    figureId: 'push',
    cues: [
      'On the floor: hands under your shoulders, knees down about a foot behind your hips, one straight line from knee to head with no bend at the hip.',
      'Lower until your chest is a fist deep off the floor, then press back to straight elbows.',
      'Steady tempo, no pause at the bottom. Rung 2 kept your knees tucked beneath your hips; sliding them a foot further back lengthens the lever, so your arms now carry more of you.',
      'Stop the set when your hips sag toward the floor, your back arches, or your chest stops reaching a fist off the floor. Do not finish a set on half-reps.',
    ],
  },
  {
    id: 'push-04-full',
    name: 'Full push-up',
    figureId: 'push',
    cues: [
      'Hands on the floor under your shoulders, legs straight and feet hip-width, glutes and quads switched on so you are one line from heel to head.',
      'Lower until your chest is a fist deep off the floor, then press to straight elbows, keeping your elbows tracking back at about 45° rather than flared out to the sides.',
      'Steady tempo, roughly one second down and one second up, with no pause at the bottom. The only change from rung 3 is that your knees are off the floor.',
      'Stop the set when your hips sag, your head pokes forward ahead of your hands, or your chest stops reaching a fist off the floor.',
    ],
  },
  {
    id: 'push-05-full-3s-down',
    name: 'Full push-up, 3-second lowering',
    figureId: 'push',
    modifier: { eccentricSeconds: 3 },
    cues: [
      'Same full push-up setup as rung 4: hands under your shoulders, legs straight, one line from heel to head.',
      'Count three full seconds on the way down only — "three, two, one" from straight arms to chest a fist off the floor. Then press back up at normal speed, about one second.',
      'There is no hold at the bottom. The instant your chest reaches its lowest point you reverse and press. The bottom is a turnaround, not a pause.',
      'Stop the set as soon as the descent stops being smooth. If the last few inches become a drop rather than a lower, that rep was your last.',
    ],
  },
  {
    id: 'push-06-full-3s-down-2s-bottom-hold',
    name: 'Full push-up, 3-second lowering + 2-second hold at the bottom',
    figureId: 'push',
    modifier: { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' },
    cues: [
      'Full push-up setup as in rung 5 — hands under your shoulders, legs straight, one line from heel to head — and the same three-second lowering count.',
      'At the bottom, stop and hold completely still for two seconds — chest a fist off the floor, elbows at 45°, body still one straight line — then press up at normal speed.',
      'That hold is the only difference from rung 5: rung 5 turns around instantly at the bottom, this rung stops and waits there for a count of two. If you are not holding still and counting, you are doing rung 5.',
      'Stop the set when you can no longer hold the bottom still for the full two seconds without your hips dropping or your chest settling onto the floor.',
    ],
  },
  // ── There is no rung 7, and that is deliberate ────────────────────────────
  //
  // `push-07-feet-elevated` needed a chair or a stair, so the floor-only fix
  // retired it. **Do not backfill it with a pike push-up.** A pike is a vertical
  // press, not a push-up plus a modifier, and "a rung is one movement plus a
  // modifier, never a different exercise" is a project invariant
  // (corpus/wiki/decisions.md). It would also cost the figure system a sixth base
  // pose for one rung, since every rung in a ladder shares its ladder's pose.
  //
  // The ladder is one rung shorter as a result. The lateral-deltoid hole that
  // leaves is already recorded as gap #6 in
  // corpus/wiki/training-science.md#muscles-getting-nothing-ranked-by-how-much-it-matters
  // — a known hole, not a new one, and not a reason to break the invariant.
  //
  // The ids below keep their original numbers: an id is immutable, so `NN` records
  // the position a rung shipped at, not its current array index. See the header.
  {
    id: 'push-08-diamond-hands',
    name: 'Diamond push-up',
    figureId: 'push',
    cues: [
      'Full push-up on the floor with your hands together under your chest, index fingers and thumbs touching to make a diamond. Feet hip-width, one line from heel to head.',
      'Lower until your chest touches your hands, then press to straight elbows, keeping your elbows brushing close to your ribs instead of flaring wide — that is what shifts the work onto your triceps.',
      'Steady tempo, one second down, one second up, no bottom hold. Rung 6\'s three-second lowering and two-second bottom hold are both dropped here — the narrow hands are this rung\'s difficulty, so do not carry its clock over.',
      'Stop the set when your elbows start flaring out or your chest no longer reaches your hands. Wrists complaining is also a stop, not something to push through.',
    ],
  },
  {
    id: 'push-09-archer',
    name: 'Archer push-up',
    figureId: 'push',
    modifier: { unilateral: true },
    safetyCritical: true,
    cues: [
      'Safety check first: only start this rung if you can hold the bottom of a full push-up still for two seconds. If you cannot, stay on rung 8 — failing an archer twists your trunk over a wide, straight, loaded arm, which is a shoulder injury rather than a missed rep. Then set your hands much wider than shoulder-width, palms flat, fingers turned slightly outward.',
      'Bend one arm and lower your chest toward that hand while the other arm stays nearly straight and slides out wide, carrying only a little weight. Press back up with the bending arm; the chest still travels to a fist off the floor on the working side.',
      'Steady tempo, no bottom hold, and alternate sides every rep — each side counts as one rep, so if the target is an odd number, start the next set on the other side.',
      'Stop the set when the straight arm starts bending to help, when your hips rotate to face the working hand, or when your chest stops reaching down to the working side.',
    ],
  },
]

// ─── SQUAT — every rung is a squat ──────────────────────────────────────────

const SQUAT_RUNGS: readonly Rung[] = [
  {
    // Id kept: the movement is still an assisted squat. Only the thing you hold
    // changed, from a doorframe to a wall.
    id: 'squat-01-assisted',
    name: 'Assisted squat, fingertips on a wall',
    figureId: 'squat',
    cues: [
      'Stand facing a wall about a forearm\'s length away, feet hip-width, toes turned slightly out, with your fingertips resting flat on the wall at chest height.',
      'Sit down and back until the tops of your thighs are parallel with the floor, then stand up fully and squeeze your glutes at the top. Knees track over your toes; heels stay glued down.',
      'Steady tempo — about one second down, one second up, no pause at the bottom. The fingertips are there to stop you tipping backward, never to take your weight.',
      'Stop the set when your heels lift, your knees cave inward, or your hands go from steadying you to pressing hard into the wall to haul you up.',
    ],
  },
  {
    id: 'squat-02-bodyweight',
    name: 'Bodyweight squat',
    figureId: 'squat',
    cues: [
      'Feet hip-width, toes turned slightly out, arms reaching straight forward at chest height as a counterweight. Nothing to hold on to now.',
      'Sit down and back until the tops of your thighs are parallel with the floor, then stand all the way up and squeeze your glutes. Chest stays up, heels stay down.',
      'Steady tempo: about one second down, one second up, moving continuously with no pause at the bottom.',
      'Stop the set when your heels lift, your knees fall inward, or you stop reaching parallel — a shallower squat is a different exercise, not a harder one.',
    ],
  },
  {
    id: 'squat-03-3s-down',
    name: 'Squat, 3-second lowering',
    figureId: 'squat',
    modifier: { eccentricSeconds: 3 },
    cues: [
      'Same stance as rung 2: feet hip-width, toes slightly out, arms forward as a counterweight.',
      'Count three full seconds on the way down only — "three, two, one" from standing to thighs parallel — then stand back up at normal speed, about one second.',
      'Do not hold at the bottom. The moment your thighs reach parallel you reverse and stand. The bottom is a turnaround, not a hold, and that is the entire difference between this rung and rung 4.',
      'Stop the set when the descent stops being smooth: if you sink or drop through the last few inches instead of lowering, that rep was your last.',
    ],
  },
  {
    id: 'squat-04-3s-down-2s-bottom-hold',
    name: 'Squat, 3-second lowering + 2-second hold at the bottom',
    figureId: 'squat',
    modifier: { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom' },
    cues: [
      'Same stance as rung 3 — feet hip-width, toes slightly out, arms forward — and the same three-second lowering count from standing to thighs parallel.',
      'At the bottom, stop and hold still for two seconds: thighs parallel, chest up, weight in the middle of your feet, still breathing. Nothing moves during the hold. Only then stand up, at normal speed.',
      'Rung 3 turns around instantly at parallel; this rung stops and waits there for a count of two. If you are not counting a still two-second hold at the bottom, you are doing rung 3.',
      'Stop the set when you cannot hold the bottom still — heels lifting, lower back rounding, or bouncing to get out of the hole all mean the set is over.',
    ],
  },
  {
    id: 'squat-05-heels-elevated',
    name: 'Heels-elevated squat, deeper range',
    figureId: 'squat',
    modifier: { eccentricSeconds: 3, pauseSeconds: 2, pauseAt: 'bottom', elevation: 'heels' },
    cues: [
      'Put your heels on a 2–4 cm book with the balls of your feet on the floor. Stance unchanged: hip-width, toes slightly out.',
      'Now spend the extra range you just bought: descend past parallel until the backs of your thighs come close to your calves, then stand all the way up. Depth is what this rung adds — the elevation exists to let you sit lower, so go lower.',
      'Keep rung 4\'s clock exactly: three seconds down, two seconds held still at the very bottom, then stand at normal speed. Same tempo as rung 4, deeper hole.',
      'Stop the set when your lower back rounds at the bottom, when your knees ache instead of your thighs working, or when you can no longer reach the deeper position.',
    ],
  },
  {
    id: 'squat-06-split',
    name: 'Split squat',
    figureId: 'squat',
    modifier: { unilateral: true },
    cues: [
      'Step one foot a long stride forward with the back heel lifted, feet in line with your hips. Fingertips on a wall for balance if you need them.',
      'Lower straight down until your back knee is an inch off the floor and your front thigh is parallel, then drive up through the front foot. Torso stays upright — you are going down, not lunging forward.',
      'Back to a steady tempo: one second down, one second up, no bottom hold. The split stance is this rung\'s difficulty, so do not carry rung 5\'s three-second count or two-second hold over. Do all reps on one leg, then switch — the target is reps per leg.',
      'Stop the set when your front knee drifts inside your foot, your torso pitches forward to help, or you are catching your balance on the wall every rep.',
    ],
  },
  {
    id: 'squat-07-assisted-single-leg',
    name: 'Assisted single-leg squat',
    figureId: 'squat',
    modifier: { unilateral: true },
    safetyCritical: true,
    cues: [
      'Safety check first: only start this rung if you can stand out of a deep two-legged squat with no help at all. A single-leg squat that fails does it with the knee collapsing inward under your whole weight. Then stand on one leg with one hand flat on a wall at shoulder height, the other leg held straight out in front, low but clear of the floor.',
      'Lower on the standing leg as far as you can control, aiming for that thigh at parallel, then stand back up. Use the hand for as little help as gets you through the rep, and a little less each session.',
      'Steady tempo, one second down, one second up, no bottom hold. Reps count per leg. Leverage, not the clock, is what makes this rung hard.',
      'Stop the set when the supporting hand starts pushing you up rather than steadying you, or when the standing heel lifts off the floor.',
    ],
  },
  {
    id: 'squat-08-pistol-progression',
    name: 'Pistol squat progression',
    figureId: 'squat',
    safetyCritical: true,
    modifier: { unilateral: true },
    cues: [
      'Safety check first: only start this rung once rung 7 is controlled all the way down, because here there is no hand on the wall to catch you. Then stand on one leg, free leg straight out in front, arms forward, with a firm stack of folded blankets behind you at the lowest height you can still stand up from unaided.',
      'Lower under control until you just touch the stack — touch, do not sit and rest — then stand straight back up on the same leg. Take a blanket off the stack as you get stronger; a full pistol is a touch down beside your own heel.',
      'Steady tempo, one second down, one second up, no hold. Reps count per leg, and the free foot stays off the floor for the whole set.',
      'Stop the set when you drop onto the stack instead of touching it, when the free foot touches down to help, or when the standing knee twists inward.',
    ],
  },
]

// ─── HINGE — posterior chain, bridge to sliding leg curl ────────────────────
//
// Rungs 5–6 were couch-anchored nordic negatives until brief 15: the anchor
// violated the floor-only constraint, and a hamstring cannot be anchored to a
// floor. The sliding leg curl replaces them and is **not** a downgrade — it
// biases *biceps femoris*, which the nordic does not, and needs nothing but a
// floor and a towel. With the nordics gone this ladder has no rung whose failure
// mode is injurious, so nothing here is `safetyCritical`.

const HINGE_RUNGS: readonly Rung[] = [
  {
    id: 'hinge-01-glute-bridge',
    name: 'Glute bridge',
    figureId: 'hinge',
    cues: [
      'Lie on your back, knees bent, heels about a hand\'s length from your backside, feet hip-width and flat. Arms by your sides, palms down.',
      'Drive through your heels and lift your hips until you are a straight line from knee to shoulder, then lower until your backside just brushes the floor. Brushing is the bottom of the rep — do not settle and rest there.',
      'Steady tempo, about one second up and one second down, with no hold at the top. This rung has no pause. Squeeze your glutes to finish the lift; do not arch your lower back to gain height.',
      'Stop the set when you feel the work in your lower back instead of your glutes and hamstrings, or when your hips stop reaching the straight line.',
    ],
  },
  {
    id: 'hinge-02-glute-bridge-2s-top-hold',
    name: 'Glute bridge, 2-second hold at the top',
    figureId: 'hinge',
    modifier: { pauseSeconds: 2, pauseAt: 'top' },
    cues: [
      'Same setup as rung 1: on your back, heels a hand\'s length from your backside, feet hip-width and flat.',
      'Lift your hips to the straight knee-to-shoulder line, then hold still there for two seconds with your glutes squeezed hard and your ribs pulled down so your lower back stays flat. Then lower over about one second until your backside brushes the floor.',
      'The hold is at the top of every rep, not the bottom: rung 1 passes straight through the top, this rung stops there and counts two. Do not trade it for a rest at the bottom — the bottom is still just a brush.',
      'Stop the set when the two-second hold makes your lower back arch or your hamstrings cramp, or when your hips sink during the hold.',
    ],
  },
  {
    id: 'hinge-03-single-leg-bridge',
    name: 'Single-leg glute bridge',
    figureId: 'hinge',
    modifier: { unilateral: true },
    cues: [
      'On your back with one foot flat, heel a hand\'s length from your backside; lift the other leg with the knee bent and the shin roughly level, or hold it straight up. Arms by your sides for balance.',
      'Push through the one planted heel and lift until knee, hip and shoulder line up, keeping your hips dead level — no dipping toward the free-leg side. Lower until your backside brushes the floor.',
      'Steady tempo, one second up, one second down, and no hold at the top: rung 2\'s two-second pause is dropped here because one leg now does all the work. Reps count per side — finish one side, then switch.',
      'Stop the set when your hips tilt, when the planted foot slides or your toes claw the floor, or when your hips stop reaching the straight line.',
    ],
  },
  {
    // Was `hinge-04-single-leg-feet-elevated`, which put the planted heel on a
    // chair. Pushing the heel out along the floor buys the same longer lever and
    // the same hamstring bias with nothing under it. New movement, new id.
    id: 'hinge-04-single-leg-heel-far',
    name: 'Single-leg glute bridge, heel far from your hips',
    figureId: 'hinge',
    modifier: { unilateral: true },
    cues: [
      'On your back with one foot flat and that heel pushed out until the knee is only slightly bent — roughly two hand-lengths further from your backside than on rung 3. Lift the other leg, knee bent or straight, arms by your sides.',
      'Push down through the far heel and lift your hips until knee, hip and shoulder line up, hips dead level with no dip toward the free-leg side, then lower until your backside brushes the floor.',
      'Steady tempo, one second up, one second down, still no hold at the top. The only change from rung 3 is how far out the heel sits: the straighter leg moves the work off your glutes and onto your hamstrings. Reps count per side — finish one side, then switch.',
      'Stop the set when your hips tilt, when the planted heel slides further away from you, or when your hamstring cramps rather than working hard.',
    ],
  },
  {
    // Replaces `hinge-05-nordic-negative`. Floor and a towel, no anchor.
    id: 'hinge-05-sliding-leg-curl',
    name: 'Bilateral sliding leg curl',
    figureId: 'hinge',
    cues: [
      'Lie on your back on a smooth floor with a folded towel under each heel, knees bent about 90°, feet hip-width. Lift your hips into a bridge — one straight line from knee to shoulder — and keep them up for every rep of the set.',
      'Keeping your hips up, slide both heels slowly away until your legs are nearly straight, then pull them back in under your knees. Your hips must not drop while the heels travel; holding that height is the exercise.',
      'Steady tempo: about two seconds sliding out, two seconds pulling back in, with no pause at either end. Both legs work together on this rung.',
      'Stop the set when your hips sink as the heels slide out, when your lower back arches to keep the height, or when your hamstrings cramp. A cramp is a stop, not something to push through.',
    ],
  },
  {
    // Replaces `hinge-06-nordic-negative-long-eccentric`.
    id: 'hinge-06-sliding-curl-eccentric',
    name: 'Sliding leg curl, 5-second slide out only',
    figureId: 'hinge',
    modifier: { eccentricSeconds: 5 },
    cues: [
      'Same setup as rung 5: a folded towel under each heel on a smooth floor, knees bent, hips lifted into the straight knee-to-shoulder line.',
      'Now stretch the slide out to five full seconds — "five, four, three, two, one" as your heels travel away and your legs straighten — resisting slowly and fighting for every inch with your hamstrings.',
      'Then let your hips down to the floor, pull your feet back in with the hips resting down, and lift into the bridge again for the next rep. That is the second difference from rung 5: five seconds out instead of two, and no loaded curl back in.',
      'Stop the set the moment the slide collapses into a slither you cannot slow, or at any sharp pull behind your thigh. Soreness two days later is expected; sharp pain during a rep ends the set.',
    ],
  },
  {
    // New top rung. The nordic negatives it replaces were the only rungs above
    // index 3, so the ladder would otherwise be a rung shorter than the others.
    id: 'hinge-07-single-leg-slide',
    name: 'Single-leg sliding leg curl',
    figureId: 'hinge',
    modifier: { unilateral: true },
    cues: [
      'Same bridge setup as rung 5 but with only one heel on a folded towel. Hold the other leg clear of the floor with the knee bent, and lift your hips into the straight knee-to-shoulder line.',
      'Slide the working heel slowly away until that leg is nearly straight, then pull it back in under your knee, hips staying up the whole time and level from side to side.',
      'Steady tempo, about two seconds out and two seconds back, no pause at either end — do not carry rung 6\'s five-second count over. One leg now carries all of it, which is the only change from rung 5. Reps count per side — finish one side, then switch.',
      'Stop the set when your hips drop or tilt toward the free leg, when the heel skids out faster than you meant to let it, or when your hamstring cramps.',
    ],
  },
]

// ─── CORE — time-based, every rung declares its own span ────────────────────

const CORE_RUNGS: readonly Rung[] = [
  {
    id: 'core-01-dead-bug',
    name: 'Dead bug',
    figureId: 'plank',
    range: SEC_20_45,
    cues: [
      'Lie on your back with both arms pointing straight at the ceiling and both knees bent 90° above your hips. Press your lower back flat into the floor and keep it pressed for the whole hold — that flatness is the exercise.',
      'Slowly reach one arm overhead and the opposite leg out straight and low, just above the floor, then bring both back and swap sides. Keep alternating, slowly, for the whole time on the clock.',
      'Breathe out as you extend. The clock runs continuously — there is no rest between sides.',
      'Stop the clock when your lower back lifts away from the floor and you cannot press it back down, even if time remains.',
    ],
  },
  {
    id: 'core-02-plank',
    name: 'Front plank',
    figureId: 'plank',
    // The one hold that runs to 60s: the plank is the position the transfer
    // evidence is strongest for, and 60s is where it starts dropping off.
    range: SEC_20_60,
    cues: [
      'Forearms on the floor with your elbows directly under your shoulders, feet hip-width, one straight line from heels to head, hips level with your shoulders.',
      'Squeeze your glutes, tuck your ribs down toward your hips, and push the floor away with your forearms. Hold still and breathe normally for the whole time — this is a hold, not a rest position.',
      'Look at the floor just ahead of your hands so your neck stays in line with your spine.',
      'Stop the clock when your hips sag toward the floor or ride up into a pike and you cannot correct it. A sagging plank trains nothing and loads your lower back.',
    ],
  },
  {
    id: 'core-03-side-plank',
    name: 'Side plank',
    figureId: 'plank',
    modifier: { unilateral: true },
    range: SEC_15_45,
    cues: [
      'Lie on one side with your forearm on the floor, elbow directly under your shoulder, feet stacked — or the lower knee down if stacking is too much. Lift your hips into one straight line from ankle to head.',
      'Push your bottom shoulder away from the floor and hold still with your hips stacked: the top hip must not drift backward or sink. Breathe normally.',
      'Split the time on the clock evenly between the two sides — half the seconds on each.',
      'Stop the clock when the bottom hip sinks or you have to roll your chest toward the floor to stay up.',
    ],
  },
  {
    id: 'core-04-hollow-hold',
    name: 'Hollow hold',
    figureId: 'plank',
    range: SEC_15_45,
    safetyCritical: true,
    cues: [
      'Safety check first: lie on your back, press your lower back flat into the floor, then lift your shoulder blades and legs a few inches clear with your arms reaching back past your ears. If your lower back peels away from the floor, bend your knees or bring your arms down by your sides until it presses flat again. Only start the clock once it does.',
      'Hold that shallow banana shape absolutely still and take short, controlled breaths. An arched lower back under a long lever is how this rung hurts people, so shorten the lever rather than holding on.',
      'Nothing moves during this hold. It is the same shape as rung 5 but with no rocking at all.',
      'Stop the clock when your lower back lifts off the floor and you cannot get it back down even after shortening your arms and legs.',
    ],
  },
  {
    id: 'core-05-hollow-rock',
    name: 'Hollow rock',
    figureId: 'plank',
    range: SEC_15_45,
    safetyCritical: true,
    cues: [
      'Safety check first: set up in exactly the hollow position of rung 4 — lower back pressed flat, shoulder blades and heels off the floor, arms overhead — and do not start rocking until you can hold that shape still. A rock driven by an arching back loads your lumbar spine instead of your abs.',
      'Now rock the whole rigid shape back and forth between your upper back and your hips, like a rocking horse. The rock comes from staying stiff and shifting as one piece — your hips and shoulders must not open and close.',
      'Keep rocking continuously for the whole time on the clock. Rung 4 is dead still; this rung never stops moving.',
      'Stop the clock when your body starts folding and unfolding to make the rock happen, or when your heels or shoulders drop to the floor.',
    ],
  },
  {
    id: 'core-06-tuck-l-sit',
    name: 'Tuck L-sit progression',
    figureId: 'plank',
    // 10→30s, the lowest ceiling on any ladder: the L-sit is limited by the
    // wrists rather than the abdominals, so a long hold buys pain, not transfer.
    range: SEC_10_30,
    safetyCritical: true,
    cues: [
      'Safety check first: sit on the floor with your hands flat beside your hips, or on two low books for extra clearance, shoulders pressed down away from your ears and elbows locked straight. If your wrists already sting in that position, do not start the clock — this rung fails through the wrists, not the abs.',
      'Push into the floor, lift your backside clear, and hold both knees tucked toward your chest with your feet off the floor. Only your hands touch the ground.',
      'Hold still for the time on the clock. As it gets easier, extend your feet toward straight legs — but keep the tuck if straightening rounds your back.',
      'Stop the clock the moment your feet touch down or your elbows bend. Stop the set entirely if your wrists sting rather than your abs and shoulders working.',
    ],
  },
]

// ─── PULL — postural only, time-based. NOT a pull-strength ladder. ──────────

const PULL_RUNGS: readonly Rung[] = [
  {
    id: 'pull-01-prone-y',
    name: 'Prone Y raise',
    figureId: 'prone',
    range: SEC_10_30,
    cues: [
      'Lie face down with your forehead on a folded towel, arms straight overhead and angled out about 45° each side so they form a Y. Thumbs pointing up.',
      'Pull your shoulder blades down and together first, then lift both arms a few inches off the floor and hold. The lift is small — the work is the squeeze between your shoulder blades, not the height of your hands.',
      'Hold for the time on the clock, breathing normally, forehead staying on the towel and legs relaxed. Do not lift your chest or arch your lower back to gain height.',
      'Stop the clock when your shoulders creep toward your ears, when your neck starts doing the work, or when your arms drift back down to the floor.',
    ],
  },
  {
    id: 'pull-02-prone-t',
    name: 'Prone T raise',
    figureId: 'prone',
    range: SEC_10_30,
    cues: [
      'Same face-down setup, forehead on the towel — but your arms now go straight out to the sides at shoulder height, making a T. Thumbs up.',
      'Squeeze your shoulder blades together and lift both arms a few inches, then hold still. The T angle puts the work lower between your shoulder blades than rung 1\'s Y did.',
      'Hold for the whole time on the clock, chest and forehead staying down and your lower back quiet.',
      'Stop the clock when your shoulders shrug toward your ears, when your chest lifts off the floor to help, or when your arms sink.',
    ],
  },
  {
    id: 'pull-03-ytw-combo',
    name: 'Prone Y-T-W combo',
    figureId: 'prone',
    range: SEC_20_45,
    cues: [
      'Face down, forehead on the towel, arms overhead in the Y position from rung 1.',
      'Hold the Y for a slow count of three, sweep your arms out to the T for three, then bend your elbows and pull them down to your ribs with palms facing forward for a W — three again. Then start over at the Y.',
      'Your hands stay off the floor for the entire time on the clock: the positions change, the hold never breaks. That unbroken flow is what makes this harder than holding one shape.',
      'Stop the clock when your hands have to touch down between positions, or when your shoulders shrug up and the squeeze moves into your neck.',
    ],
  },
  {
    id: 'pull-04-reverse-snow-angel',
    name: 'Reverse snow angel',
    figureId: 'prone',
    range: SEC_20_45,
    cues: [
      'Face down, forehead on the towel, arms straight overhead with the backs of your hands held off the floor, thumbs up.',
      'Keeping your arms straight and clear of the floor the whole time, sweep them slowly out and all the way down to your hips, then slowly back overhead. One sweep out and back takes about four seconds.',
      'Keep sweeping continuously for the time on the clock. If your hands touch down at either end it does not count — go slower and use a slightly smaller range instead.',
      'Stop the clock when your hands drag on the floor, when your lower back starts arching, or when the sweep turns into a jerky swing.',
    ],
  },
  {
    id: 'pull-05-prone-lat-slide',
    name: 'Prone lat slide',
    figureId: 'prone',
    range: SEC_20_45,
    // `pauseAt: 'bottom'` = the bottom of the pull, elbows driven past the ribs.
    modifier: { pauseSeconds: 2, pauseAt: 'bottom' },
    cues: [
      'Face down, forehead on the towel, arms overhead and off the floor with elbows slightly bent, palms facing each other.',
      'Pull your elbows down toward your back pockets, driving them as far past your ribs as you can while squeezing your shoulder blades down and together. Hold that end position — the bottom of the pull — completely still for two seconds, then reach slowly back overhead.',
      'Repeat that pull-and-two-second-hold continuously for the time on the clock. Unlike rung 4\'s constant sweep, this rung stops and squeezes at the bottom of every repetition.',
      'Stop the clock when your shoulders shrug up, when your elbows stop clearing your ribs, or when your hands rest on the floor between pulls.',
    ],
  },
  {
    id: 'pull-06-end-range-isometric',
    name: 'End-range isometric hold',
    figureId: 'prone',
    range: SEC_20_45,
    cues: [
      'Face down, forehead on the towel. Move into the hardest end position you have earned on rung 5: elbows pulled down past your ribs, shoulder blades pinned down and together, hands off the floor.',
      'Now simply stay there. No movement at all for the whole time on the clock — maximum squeeze held at the very end of the range, breathing shallow and steady.',
      'Drive your shoulder blades down toward your back pockets rather than up toward your ears. The harder the squeeze, the more this rung gives you.',
      'Stop the clock when the squeeze fades and your arms start drifting, when your neck takes over, or when you have to shrug to hold the position.',
    ],
  },
]

// ─── Starting rungs — a SAFETY cap, not a calibration knob ──────────────────

/**
 * Where every document starts each ladder (`Ladder.startRungIndex`).
 *
 * There is no calibration in v3 — everyone gets the same schedule and there is no
 * regress rule to walk anybody down — so these five numbers are pure safety caps.
 *
 * ── The rule these five numbers obey ────────────────────────────────────────
 *
 * **A starting rung must never be one where FAILING is injurious.** Not "hard",
 * not "ambitious" — the test is what happens in the moment the user cannot finish
 * the rep, because on day one that is a likely outcome. A rung whose failure mode
 * is "you sink to the floor" is a legal entry point. A rung whose failure mode is
 * "your lumbar spine takes the load you could not" is not, at any plausible
 * capability.
 *
 * The rungs that rules out are exactly the ones flagged `safetyCritical: true`,
 * and they are listed again in `NEVER_A_STARTING_RUNG` so a test can assert the
 * rule rather than the numbers. Each value below is the hardest rung *left* after
 * applying the test, which is what makes it a cap rather than a preference.
 * Raising one is a safety change.
 */
const START_RUNGS: Readonly<Record<Pattern, number>> = {
  /**
   * `push-03-knees` (index 2 of 8). Failing a knee push-up lowers you onto the
   * floor from a hand's depth with your knees already down — there is nowhere to
   * fall to. A wall push-up and a short-lever knee push-up sit below it.
   */
  push: 2,
  /**
   * `squat-02-bodyweight` (index 1 of 8). A bodyweight squat that fails ends with
   * you standing up short of parallel or sitting down; both are benign. Rung 0
   * (fingertips on a wall) is the fallback, and rungs 2–4 add a 3s eccentric and a
   * bottom hold, where failure means being stuck in the hole rather than short of
   * it.
   */
  squat: 1,
  /**
   * `hinge-02-glute-bridge-2s-top-hold` (index 1 of 7). Deliberately the last
   * **bilateral, supine** rung: failure is "your hips settle back to the floor",
   * from four inches up, with both feet planted. Index 2 onward is unilateral or a
   * sliding curl, both of which fail by the hips dropping — which is why this
   * ladder no longer has a `safetyCritical` rung at all now that the couch-anchored
   * nordic negatives are gone. Kept conservative anyway: a hamstring under a long
   * lever is still the sharpest thing on this ladder.
   */
  hinge: 1,
  /**
   * `core-02-plank` (index 1 of 6). A plank fails by the hips sagging, and the
   * user drops to their knees; the cue already tells them to. It is also the one
   * core position essentially everyone has performed before. The rungs above it
   * fail through the lumbar spine or the wrists.
   */
  core: 1,
  /**
   * `pull-02-prone-t` (index 1 of 6). No rung on this ladder has an injurious
   * failure mode — every one is face-down, unloaded, and fails by the arms drifting
   * back to the floor — so here the cap is set by *plausibility*, not safety: rung
   * 2 onward requires holding an unbroken position through changing shapes, which
   * is a trained skill rather than an effort. A prone T for 10s is within reach of
   * a deconditioned upper back; a Y-T-W flow is not.
   */
  pull: 1,
}

// ─── The ladders ────────────────────────────────────────────────────────────

export const LADDERS: Readonly<Record<Pattern, Ladder>> = {
  push: {
    pattern: 'push',
    unit: 'reps',
    kind: 'strength',
    startRungIndex: START_RUNGS.push,
    range: REPS_5_12,
    sessionsPerRung: SESSIONS_PER_RUNG_ROTATING,
    rungs: PUSH_RUNGS,
  },
  squat: {
    pattern: 'squat',
    unit: 'reps',
    kind: 'strength',
    startRungIndex: START_RUNGS.squat,
    range: REPS_5_12,
    sessionsPerRung: SESSIONS_PER_RUNG_ROTATING,
    rungs: SQUAT_RUNGS,
  },
  hinge: {
    pattern: 'hinge',
    unit: 'reps',
    kind: 'strength',
    startRungIndex: START_RUNGS.hinge,
    range: REPS_5_12,
    sessionsPerRung: SESSIONS_PER_RUNG_ROTATING,
    rungs: HINGE_RUNGS,
  },
  core: {
    pattern: 'core',
    unit: 'seconds',
    kind: 'strength',
    startRungIndex: START_RUNGS.core,
    /* Never used: every `seconds` rung declares its own span, and a test enforces
       that. Declared anyway because `Ladder.range` is required — a ladder with no
       default would make the field optional for the rep ladders too. */
    range: SEC_20_45,
    sessionsPerRung: SESSIONS_PER_RUNG_DAILY,
    rungs: CORE_RUNGS,
  },
  /**
   * `postural`, never `strength`. There is no anchor, so this ladder does not train
   * the quality its pattern name implies. The marker is a safety invariant with a
   * test of its own — see `POSTURAL_NOTICE` for the wording the UI must surface.
   */
  pull: {
    pattern: 'pull',
    unit: 'seconds',
    kind: 'postural',
    startRungIndex: START_RUNGS.pull,
    range: SEC_20_45,
    sessionsPerRung: SESSIONS_PER_RUNG_DAILY,
    rungs: PULL_RUNGS,
  },
}

/**
 * Rung ids that must never be a starting rung, whatever `START_RUNGS` says.
 *
 * Exported so the test asserts the *rule* rather than the five numbers: a future
 * content edit that reorders a ladder cannot quietly move a hollow rock into an
 * entry position without failing here. A test also asserts this list and the set
 * of `safetyCritical` rungs agree exactly — they answer the same question ("does
 * failing this hurt you?") and two lists that can disagree are worse than one.
 *
 * The nordic negatives that used to head this list are gone: they were removed by
 * brief 15's floor-only fix, not for safety, and no sliding-curl rung replaces
 * their failure mode.
 */
export const NEVER_A_STARTING_RUNG: readonly string[] = [
  'push-09-archer',
  'squat-07-assisted-single-leg',
  'squat-08-pistol-progression',
  'core-04-hollow-hold',
  'core-05-hollow-rock',
  'core-06-tuck-l-sit',
]

// ─── Cardio ─────────────────────────────────────────────────────────────────

/**
 * The cardio slot's content. Not a `Ladder` and not on any ladder: it has no
 * rungs, no progression and **no number to hit**.
 *
 * Three constraints, each with a reason, and none of them is a preference:
 *
 *   - **60-second intervals, not 20.** Short-interval HIIT beats nothing but
 *     loses to longer intervals: 4×4min gave 6.5% VO2max against 3.3% for 8×20s.
 *     Do not "optimise" this into a Tabata.
 *   - **Lower-body movements only.** The push day is upper-body and the daily
 *     core/posture block runs every session, so burpees and mountain climbers
 *     would collide with both.
 *   - **Prescribed by breathlessness, never by a count.** A rep target is
 *     something the user can pace themselves down to, and a high-rep set on an
 *     easy movement ends when the muscle quits rather than when the
 *     cardiovascular system is taxed — that is a pressor response, not aerobic
 *     training. Tabata's own author published a note that copying 20/10 intervals
 *     while dropping the intensity requirement yields no VO2max improvement.
 */
export const CARDIO: CardioProtocol = {
  label: 'Cardio',
  rounds: 5,
  hardSeconds: 60,
  movements: ['High knees, running in place', 'Fast bodyweight squats'],
  prescribedBy: 'breathlessness',
  cues: [
    'Five rounds. Tap start, then go as hard as you can for the full sixty seconds — high knees or fast bodyweight squats, whichever you can drive hardest today.',
    'Judge every round by your breathing, not by a count. By the end of the minute you should be breathing far too hard to hold a conversation. There is no number to hit here and there never will be, because a number is something you can quietly pace yourself down to.',
    'Rest as long as you like between rounds — the easy interval is simply the time before you tap Next. A round is only worth anything if you can go genuinely hard in the one after it.',
    'Stop a round early if you feel chest pain, dizziness, or pain in a joint rather than hard work in your legs. Cut the round rather than easing off the intensity of the ones you do.',
  ],
  notice:
    'Five hard minutes twice a week reaches roughly 20–45% of the guideline weekly ' +
    'aerobic minimum. The fitness gains are largely achievable at this dose; the ' +
    'volume-dependent benefits — blood pressure, blood lipids, the dose-response ' +
    'mortality curve — are not. This app would rather say so than imply otherwise.',
}

// ─── Lookups ────────────────────────────────────────────────────────────────

/**
 * The rung at `index` (0-based) of `pattern`.
 *
 * Throws on an out-of-range index rather than returning `undefined`. A bad index
 * means either a scheduling bug or a hand-edited state file, and both must surface
 * immediately: returning `undefined` would let a session render blank cues and get
 * logged against nothing. `rungIndexAt` clamps, so a valid document never gets
 * here with a bad index.
 */
export function getRung(pattern: Pattern, index: number): Rung {
  const ladder = LADDERS[pattern]
  const rung = ladder.rungs[index]
  if (!rung) {
    throw new Error(
      `getRung: ${pattern} has no rung at index ${index} ` +
        `(valid range 0..${ladder.rungs.length - 1}). ` +
        'Check sessionsDone in the state document.',
    )
  }
  return rung
}

/** Highest valid rung index for a pattern. */
export function topRungIndex(pattern: Pattern): number {
  return LADDERS[pattern].rungs.length - 1
}

/**
 * Look up a rung by the id stored in history. Returns `undefined` — unlike
 * `getRung` — because a persisted id from an older content version is an expected
 * input: the floor-only fix retired six ids that are still sitting in real
 * history. That is a display problem ("—"), not a reason to break the screen.
 */
export function findRungById(rungId: string): Rung | undefined {
  for (const ladder of Object.values(LADDERS)) {
    const match = ladder.rungs.find((rung) => rung.id === rungId)
    if (match) return match
  }
  return undefined
}
