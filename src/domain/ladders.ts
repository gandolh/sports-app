/**
 * The five ladders, as data. Content, not logic — the engine (brief 04) only ever
 * asks this file "what is rung N of pattern P".
 *
 * ── RUNG IDS ARE IMMUTABLE ONCE SHIPPED ─────────────────────────────────────
 *
 * Every `id` below is written verbatim into `SessionResult.history` in the
 * persisted state document. **Renaming one orphans real training records**: the
 * history entry keeps the old string, nothing in `LADDERS` matches it, and the
 * "Last time: 3×7" line plus every chart silently loses that exercise. Adding a
 * rung is fine; reordering or renaming is not. If a rung turns out to be wrong,
 * add a new one and leave the old id in place.
 *
 * Convention (asserted in the tests): `<pattern>-<NN>-<slug>`, where `NN` is the
 * rung's 1-based position zero-padded to two digits and `slug` is lower-kebab.
 * The position is part of the id purely so a hand-edited state file is readable;
 * the engine indexes by array position, never by parsing the id.
 *
 * ── WHY THE CUES ARE THIS LONG ──────────────────────────────────────────────
 *
 * A rung is *one movement plus a modifier*, so adjacent rungs share a pose and a
 * figure. Rung 3 and rung 4 of the squat ladder look identical in a drawing. Only
 * the cue text can distinguish them, and if it fails to, the user performs both
 * the same way, the engine dutifully advances anyway, and progression becomes
 * placebo (corpus/wiki/open-questions.md #2). So each rung's cues cover:
 *
 *   1. setup — hand/foot position, what is elevated and by roughly how much
 *   2. movement standard — where the rep starts and ends
 *   3. the modifier, **located inside the rep** — never "3s down + 2s pause",
 *      always "three seconds down, then hold still two seconds at the bottom"
 *   4. the failure signal — the sentence that says *stop the set*
 *
 * Two conventions follow from that and are deliberate, not verbose:
 *
 *   - **Every rung states its tempo explicitly, even when the tempo is normal.**
 *     Silence about tempo is how a modifier leaks forward into a rung that should
 *     not carry it (push 7, squat 6) or gets dropped from one that should
 *     (squat 5). "Steady tempo, no pause" is information.
 *   - **A rung whose only difference from its neighbour is a pause or a count
 *     names that neighbour and says what changed.** Cross-references cost a
 *     clause and buy the whole point of the ladder. "Rung 4" means the rung
 *     numbered `04` in its id — the same 1-based number a person sees in the state
 *     file. A cross-reference never *replaces* an absolute instruction, because
 *     the card on screen only ever shows the current rung: every rung restates
 *     its own setup and its own tempo in full.
 *
 * `figureId` names one of brief 10's five base pose pairs
 * (push · squat · hinge · prone · plank). Rungs within a ladder share one pose by
 * design; the per-rung difference is an overlay plus the cues above.
 */
import type { Ladder, Pattern, Rung } from './types.ts'

/** Rep-based ladders: 3×5 climbing to 3×12, then the next modifier. */
const REP_MIN = 5
const REP_MAX = 12

/** Time-based ladders: 3×20s climbing to 3×45s, then the next modifier. */
const SEC_MIN = 20
const SEC_MAX = 45

/**
 * `<pattern>-<NN>-<slug>`. Exported so the tests and any future validator check
 * the same rule rather than two drifting copies of it.
 */
export const RUNG_ID_PATTERN = /^(?:push|squat|hinge|core|pull)-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What the UI must show alongside any ladder with `kind: 'postural'`. v1 has no
 * anchor, so the Pull slot trains scapular retraction and upper-back endurance —
 * the posture half of the imbalance — and nothing else. Saying so is a locked
 * decision with a safety rationale: presenting postural work as pull strength is
 * the misrepresentation that does real damage
 * (corpus/wiki/decisions.md#zero-equipment-and-the-pull-gap).
 */
export const POSTURAL_NOTICE =
  'Postural work, not pulling strength. With no bar or anchor, horizontal pulling ' +
  'cannot be trained at home — this slot builds the upper back and shoulder-blade ' +
  'control that sitting takes away. The gap is real and this app does not pretend ' +
  'otherwise.'

// ─── PUSH — every rung is a push-up ─────────────────────────────────────────

const PUSH_RUNGS: readonly Rung[] = [
  {
    id: 'push-01-hands-high',
    name: 'Push-up, hands on a counter',
    figureId: 'push',
    modifier: { elevation: 'hands' },
    cues: [
      'Hands on a kitchen counter or windowsill at about hip-to-chest height, shoulder-width apart, then walk your feet back until you are one straight line from heel to head.',
      'Lower until your chest touches the counter edge, then push until your elbows are straight. Chest to the edge is the rep — a half-rep does not count.',
      'Steady tempo: about one second down, one second up, and no pause at either end. This rung has no tempo modifier.',
      'Stop the set the moment your hips sag or your lower back arches, even if your arms still feel fresh — that is failure of the plank, which is half of a push-up.',
    ],
  },
  {
    id: 'push-02-hands-low',
    name: 'Push-up, hands on a chair',
    figureId: 'push',
    modifier: { elevation: 'hands' },
    cues: [
      'Hands on the front edge of a sturdy chair seat or the third stair, shoulder-width, feet walked back into one straight line from heel to head.',
      'Lower until your chest touches the chair edge, then press all the way back to straight elbows.',
      'Same steady one-second-down, one-second-up tempo as rung 1, still no pause. The only change is that your hands are lower, which shifts more of your weight onto your arms.',
      'Stop the set when your hips sag, your elbows flare wide of 45°, or your chest stops reaching the chair.',
    ],
  },
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
    id: 'push-03-knees',
    name: 'Knee push-up',
    figureId: 'push',
    cues: [
      'On the floor: hands under your shoulders, knees down about a foot behind your hips, one straight line from knee to head with no bend at the hip.',
      'Lower until your chest is a fist deep off the floor, then press back to straight elbows.',
      'Steady tempo, no pause at the bottom. Rung 2 had your hands raised; here they are on the floor and your chest travels the full range.',
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
  {
    id: 'push-07-feet-elevated',
    name: 'Feet-elevated push-up',
    figureId: 'push',
    modifier: { elevation: 'feet' },
    cues: [
      'Hands on the floor under your shoulders, feet up on a chair seat or the second stair so your shoulders sit lower than your hips. Still one straight line from heel to head.',
      'Lower until your chest is a fist deep off the floor, then press to straight elbows. Look at the floor a hand ahead of you so your neck stays in line.',
      'Back to a steady tempo — one second down, one second up, no pause at the bottom. The elevation is this rung\'s difficulty, so do not carry rung 6\'s three-second count or two-second hold over.',
      'Stop the set when your lower back arches, your hips pike up to shorten the rep, or your chest stops reaching a fist off the floor.',
    ],
  },
  {
    id: 'push-08-diamond-hands',
    name: 'Diamond push-up',
    figureId: 'push',
    cues: [
      'Full push-up on the floor with your hands together under your chest, index fingers and thumbs touching to make a diamond. Feet hip-width, one line from heel to head.',
      'Lower until your chest touches your hands, then press to straight elbows, keeping your elbows brushing close to your ribs instead of flaring wide — that is what shifts the work onto your triceps.',
      'Steady tempo, one second down, one second up, no bottom hold. Your feet are back on the floor for this rung; the narrow hands are the difficulty.',
      'Stop the set when your elbows start flaring out or your chest no longer reaches your hands. Wrists complaining is also a stop, not something to push through.',
    ],
  },
  {
    id: 'push-09-archer',
    name: 'Archer push-up',
    figureId: 'push',
    modifier: { unilateral: true },
    cues: [
      'Full push-up with your hands set much wider than shoulder-width, both palms flat, the fingers of each hand turned slightly outward.',
      'Bend one arm and lower your chest toward that hand while the other arm stays nearly straight and slides out wide, carrying only a little weight. Press back up with the bending arm; the chest still travels to a fist off the floor on the working side.',
      'Steady tempo, no bottom hold, and alternate sides every rep — each side counts as one rep, so if the target is an odd number, start the next set on the other side.',
      'Stop the set when the straight arm starts bending to help, when your hips rotate to face the working hand, or when your chest stops reaching down to the working side.',
    ],
  },
]

// ─── SQUAT — every rung is a squat ──────────────────────────────────────────

const SQUAT_RUNGS: readonly Rung[] = [
  {
    id: 'squat-01-assisted',
    name: 'Assisted squat, holding a doorframe',
    figureId: 'squat',
    cues: [
      'Stand an arm\'s length from a doorframe, feet hip-width, toes turned slightly out. Hold both sides of the frame at chest height.',
      'Sit down and back until the tops of your thighs are parallel with the floor, then stand up fully and squeeze your glutes at the top. Knees track over your toes; heels stay glued down.',
      'Steady tempo — about one second down, one second up, no pause at the bottom. Pull on the frame only to keep your balance, never to hoist yourself up.',
      'Stop the set when your heels lift, your knees cave inward, or your hands go from steadying you to hauling you up.',
    ],
  },
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
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
      'Put your heels on a 2–4 cm book or board with the balls of your feet on the floor. Stance unchanged: hip-width, toes slightly out.',
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
    cues: [
      'Stand on one leg beside a doorframe or the back of a chair, other leg held straight out in front and low but clear of the floor, one hand resting on the support.',
      'Lower on the standing leg as far as you can control, aiming for that thigh at parallel, then stand back up. Use the hand for as little help as gets you through the rep, and a little less each session.',
      'Steady tempo, one second down, one second up, no bottom hold. Reps count per leg. Leverage, not the clock, is what makes this rung hard.',
      'Stop the set when the supporting hand starts pulling you up rather than steadying you, or when the standing heel lifts off the floor.',
    ],
  },
  {
    id: 'squat-08-pistol-progression',
    name: 'Pistol squat progression',
    figureId: 'squat',
    modifier: { unilateral: true },
    cues: [
      'Stand on one leg, free leg straight out in front, arms forward. Set a chair or a stack of cushions behind you at the lowest height you can still stand up from without help.',
      'Lower under control until you just touch the seat — touch, do not sit and rest — then stand straight back up on the same leg. Lower the seat as you get stronger; a full pistol is a touch down beside your own heel.',
      'Steady tempo, one second down, one second up, no hold. Reps count per leg, and the free foot stays off the floor for the whole set.',
      'Stop the set when you drop onto the seat instead of touching it, when the free foot touches down to help, or when the standing knee twists inward.',
    ],
  },
]

// ─── HINGE — posterior chain, bridge to nordic ──────────────────────────────

const HINGE_RUNGS: readonly Rung[] = [
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
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
    id: 'hinge-04-single-leg-feet-elevated',
    name: 'Single-leg glute bridge, foot elevated',
    figureId: 'hinge',
    modifier: { unilateral: true, elevation: 'feet' },
    cues: [
      'The same single-leg bridge, but with the planted heel up on a chair seat or sofa edge — roughly knee height as you lie down — with that knee bent about 90°. Free leg lifted, knee bent or straight.',
      'Push through the elevated heel and lift your hips high enough to make a straight knee-hip-shoulder line, then lower until your backside is just above the floor. The elevation lengthens the range, so the bottom of the rep is now further down than on rung 3.',
      'Steady tempo, one second up, one second down, still no hold at the top. The only change from rung 3 is the height of your foot and the longer range that comes with it. Reps count per side.',
      'Stop the set when your hips cannot reach the top line, when your hamstring gives a sharp pull rather than a hard working burn, or when the planted foot slips on the chair.',
    ],
  },
  {
    id: 'hinge-05-nordic-negative',
    name: 'Couch-anchored nordic negative',
    figureId: 'hinge',
    modifier: { eccentricSeconds: 3 },
    cues: [
      'Kneel on a folded blanket facing away from the sofa with your heels and lower calves wedged firmly under the couch frame or the front edge of the seat. Tug hard against the anchor before your first rep: if your heels can pull free at all, do not do this rung. Put both hands on the floor in front of you, ready to catch.',
      'Squeeze your glutes and hold a straight line from knee to shoulder with no bend at the hip. Lower your whole body forward as slowly as you can, resisting the entire way with your hamstrings — at least three seconds.',
      'The instant you can no longer slow the fall, plant your hands and catch yourself on the floor. That bail-out is part of every rep, not a failure. Push back up to kneeling with your arms, not your hamstrings.',
      'Stop the set immediately at any sharp or pulling sensation behind your thigh, or the moment a rep turns into a free-fall you have to catch. Hamstring strains happen on this movement and they happen without warning — finish this set early rather than late.',
    ],
  },
  {
    id: 'hinge-06-nordic-negative-long-eccentric',
    name: 'Nordic negative, 5-second lowering',
    figureId: 'hinge',
    modifier: { eccentricSeconds: 5 },
    cues: [
      'Same setup and the same safety check as rung 5: heels and calves wedged under the couch frame, blanket under your knees, hands ready on the floor, and a hard tug on the anchor before the first rep.',
      'Straight line from knee to shoulder, glutes squeezed, hips never bending. Now stretch the lowering out to five seconds or more, resisting slowly with your hamstrings and fighting for every inch, and aim to keep control further down than you managed on rung 5.',
      'This rung differs from rung 5 in exactly two ways: the lowering count is five seconds instead of three, and you hold control deeper before bailing. Still catch yourself with your hands, and still push back up to kneeling with your arms.',
      'Stop the set the moment the lowering collapses into a fall, or at any sharp pull behind your thigh. Soreness two days later is expected; sudden sharp pain during a rep ends the session for that pattern.',
    ],
  },
]

// ─── CORE — time-based ──────────────────────────────────────────────────────

const CORE_RUNGS: readonly Rung[] = [
  {
    id: 'core-01-dead-bug',
    name: 'Dead bug',
    figureId: 'plank',
    cues: [
      'Lie on your back with both arms pointing straight at the ceiling and both knees bent 90° above your hips. Press your lower back flat into the floor and keep it pressed for the whole hold — that flatness is the exercise.',
      'Slowly reach one arm overhead and the opposite leg out straight and low, just above the floor, then bring both back and swap sides. Keep alternating, slowly, for the whole time on the clock.',
      'Breathe out as you extend. The clock runs continuously — there is no rest between sides.',
      'Stop the clock when your lower back lifts away from the floor and you cannot press it back down, even if time remains.',
    ],
  },
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
    id: 'core-02-plank',
    name: 'Front plank',
    figureId: 'plank',
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
    cues: [
      'Lie on your back, press your lower back flat into the floor, then lift your shoulder blades and your legs a few inches clear of it, arms reaching back past your ears if you can keep the back flat.',
      'Hold that shallow banana shape absolutely still and take short, controlled breaths. If your lower back peels up, bend your knees or bring your arms down by your sides to shorten the lever, and keep holding.',
      'Nothing moves during this hold. It is the same shape as rung 5 but with no rocking at all.',
      'Stop the clock when your lower back lifts off the floor and you cannot get it back down even after shortening your arms and legs.',
    ],
  },
  {
    id: 'core-05-hollow-rock',
    name: 'Hollow rock',
    figureId: 'plank',
    cues: [
      'Set up in exactly the hollow position of rung 4: lower back pressed flat, shoulder blades and heels off the floor, arms overhead.',
      'Now rock the whole rigid shape back and forth between your upper back and your hips, like a rocking chair. The rock comes from staying stiff and shifting as one piece — your hips and shoulders must not open and close.',
      'Keep rocking continuously for the whole time on the clock. Rung 4 is dead still; this rung never stops moving.',
      'Stop the clock when your body starts folding and unfolding to make the rock happen, or when your heels or shoulders drop to the floor.',
    ],
  },
  {
    id: 'core-06-tuck-l-sit',
    name: 'Tuck L-sit progression',
    figureId: 'plank',
    cues: [
      'Sit on the floor with your hands flat beside your hips, or on two low books for extra clearance. Press your shoulders down away from your ears and lock your elbows straight.',
      'Push into the floor, lift your backside clear, and hold both knees tucked toward your chest with your feet off the floor. Only your hands touch the ground.',
      'Hold still for the time on the clock. As it gets easier, extend your feet toward straight legs — but keep the tuck if straightening rounds your back.',
      'Stop the clock the moment your feet touch down or your elbows bend. Stop the set entirely if your wrists sting rather than your abs and shoulders working.',
    ],
  },
]

// ─── PULL — postural only, time-based. NOT a pull-strength ladder. ──────────

const PULL_RUNGS: readonly Rung[] = [
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
    id: 'pull-01-prone-y',
    name: 'Prone Y raise',
    figureId: 'prone',
    cues: [
      'Lie face down with your forehead on a folded towel, arms straight overhead and angled out about 45° each side so they form a Y. Thumbs pointing up.',
      'Pull your shoulder blades down and together first, then lift both arms a few inches off the floor and hold. The lift is small — the work is the squeeze between your shoulder blades, not the height of your hands.',
      'Hold for the time on the clock, breathing normally, forehead staying on the towel and legs relaxed. Do not lift your chest or arch your lower back to gain height.',
      'Stop the clock when your shoulders creep toward your ears, when your neck starts doing the work, or when your arms drift back down to the floor.',
    ],
  },
  {
    // Id fixed by src/domain/__tests__/fixtures.ts — do not rename.
    id: 'pull-02-prone-t',
    name: 'Prone T raise',
    figureId: 'prone',
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
 * Where a brand-new document starts each ladder (`Ladder.startRungIndex`).
 *
 * Calibration is **descending** (corpus/wiki/decisions.md, "No effort input
 * anywhere"): there is no effort tap, therefore no fast-track, therefore no way
 * for the engine to climb quickly to a rung that fits. So it starts at a rung a
 * returning beginner plausibly *can* perform and lets the 3-miss regress rule
 * walk them down. A missed set is free information; a question is not.
 *
 * ── The rule these five numbers obey ────────────────────────────────────────
 *
 * **A starting rung must never be one where FAILING is injurious.** Not "hard",
 * not "ambitious" — the test is what happens in the moment the user cannot
 * finish the rep, because on day one that is a likely outcome by design. A rung
 * whose failure mode is "you sink to the floor" is a legal entry point. A rung
 * whose failure mode is "your hamstring takes the load you could not" is not, at
 * any plausible capability.
 *
 * That rules the following out as entry points *regardless* of how strong the
 * user might be, and they are named here so nobody has to re-derive it:
 *
 *   - `hinge-05/06-nordic-negative*` — an uncontrolled nordic is a documented
 *     hamstring-strain mechanism, and the rung's own cues say strains here
 *     "happen without warning". Never an entry point.
 *   - `squat-07-assisted-single-leg`, `squat-08-pistol-progression` — failing a
 *     loaded single-leg squat is a knee-valgus collapse under bodyweight.
 *   - `push-09-archer` — failure rotates the trunk over a wide-set, extended arm.
 *   - `core-03..06` (hollow hold/rock, tuck L-sit) — hollow work fails by the
 *     lumbar spine extending under load, and the L-sit fails through the wrists.
 *
 * Each value below is the hardest rung *left* after applying that test, which is
 * what makes it a cap rather than a preference. Raising one is a safety change.
 */
const START_RUNGS: Readonly<Record<Pattern, number>> = {
  /**
   * `push-03-knees` (index 2 of 9). Failing a knee push-up lowers you onto the
   * floor from a hand's depth with your knees already down — there is nowhere to
   * fall to. Two rungs of counter/chair elevation sit below it for anyone who
   * cannot, and the regress rule finds them in three sessions.
   */
  push: 2,
  /**
   * `squat-02-bodyweight` (index 1 of 8). A bodyweight squat that fails ends
   * with you standing up short of parallel or sitting down; both are benign, and
   * neither needs a spotter or an anchor. Rung 0 (holding a doorframe) is the
   * fallback, and rungs 2–4 add a 3s eccentric and a bottom hold, where failure
   * means being stuck in the hole rather than short of it.
   */
  squat: 1,
  /**
   * `hinge-02-glute-bridge-2s-top-hold` (index 1 of 6). Deliberately the last
   * **bilateral, supine** rung: failure is "your hips settle back to the floor",
   * from four inches up, with both feet planted. Index 2 onward is unilateral
   * and index 4–5 are nordic negatives, and the hinge is the one pattern here
   * whose too-hard failure mode is a named injury rather than a missed rep. This
   * is the most conservative of the five numbers on purpose.
   */
  hinge: 1,
  /**
   * `core-02-plank` (index 1 of 6). A plank fails by the hips sagging, and the
   * user drops to their knees; the cue already tells them to. It is also the one
   * core position essentially everyone has performed before, which matters when
   * the first session has no calibration data at all. The rungs above it fail
   * through the lumbar spine or the wrists (see above).
   */
  core: 1,
  /**
   * `pull-02-prone-t` (index 1 of 6). No rung on this ladder has an injurious
   * failure mode — every one is face-down, unloaded, and fails by the arms
   * drifting back to the floor — so here the cap is set by *plausibility*, not
   * safety: rung 2 onward requires holding an unbroken position through changing
   * shapes, which is a trained skill rather than an effort. A prone T for 20s is
   * within reach of a deconditioned upper back; a Y-T-W flow is not.
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
    targetMin: REP_MIN,
    targetMax: REP_MAX,
    rungs: PUSH_RUNGS,
  },
  squat: {
    pattern: 'squat',
    unit: 'reps',
    kind: 'strength',
    startRungIndex: START_RUNGS.squat,
    targetMin: REP_MIN,
    targetMax: REP_MAX,
    rungs: SQUAT_RUNGS,
  },
  hinge: {
    pattern: 'hinge',
    unit: 'reps',
    kind: 'strength',
    startRungIndex: START_RUNGS.hinge,
    targetMin: REP_MIN,
    targetMax: REP_MAX,
    rungs: HINGE_RUNGS,
  },
  core: {
    pattern: 'core',
    unit: 'seconds',
    kind: 'strength',
    startRungIndex: START_RUNGS.core,
    targetMin: SEC_MIN,
    targetMax: SEC_MAX,
    rungs: CORE_RUNGS,
  },
  /**
   * `postural`, never `strength`. v1 has no anchor, so this ladder does not train
   * the quality its pattern name implies. The marker is a safety invariant with a
   * test of its own — see `POSTURAL_NOTICE` for the wording the UI must surface.
   */
  pull: {
    pattern: 'pull',
    unit: 'seconds',
    kind: 'postural',
    startRungIndex: START_RUNGS.pull,
    targetMin: SEC_MIN,
    targetMax: SEC_MAX,
    rungs: PULL_RUNGS,
  },
}

/**
 * Rung ids that must never be a starting rung, whatever `START_RUNGS` says.
 *
 * Exported so the test asserts the *rule* rather than the five numbers: a future
 * content edit that reorders a ladder cannot quietly move a nordic negative into
 * an entry position without failing here.
 */
export const NEVER_A_STARTING_RUNG: readonly string[] = [
  'hinge-05-nordic-negative',
  'hinge-06-nordic-negative-long-eccentric',
  'squat-07-assisted-single-leg',
  'squat-08-pistol-progression',
  'push-09-archer',
  'core-04-hollow-hold',
  'core-05-hollow-rock',
  'core-06-tuck-l-sit',
]

// ─── Lookups ────────────────────────────────────────────────────────────────

/**
 * The rung at `index` (0-based) of `pattern`.
 *
 * Throws on an out-of-range index rather than returning `undefined`. A bad index
 * means either an engine bug or a hand-edited `rungIndex` past the top of the
 * ladder, and both must surface immediately: returning `undefined` would let a
 * session render blank cues and get logged against nothing.
 */
export function getRung(pattern: Pattern, index: number): Rung {
  const ladder = LADDERS[pattern]
  const rung = ladder.rungs[index]
  if (!rung) {
    throw new Error(
      `getRung: ${pattern} has no rung at index ${index} ` +
        `(valid range 0..${ladder.rungs.length - 1}). ` +
        'Check rungIndex in the state document.',
    )
  }
  return rung
}

/** Highest valid `rungIndex` for a pattern. */
export function topRungIndex(pattern: Pattern): number {
  return LADDERS[pattern].rungs.length - 1
}

/**
 * Look up a rung by the id stored in history. Returns `undefined` — unlike
 * `getRung` — because a persisted id from a future or hand-edited state file is a
 * display problem ("Last time: —"), not a reason to break the screen.
 */
export function findRungById(rungId: string): Rung | undefined {
  for (const ladder of Object.values(LADDERS)) {
    const match = ladder.rungs.find((rung) => rung.id === rungId)
    if (match) return match
  }
  return undefined
}
