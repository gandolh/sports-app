# Calisthenics app — v1 spec

A zero-equipment, at-home calisthenics trainer. Single user. Offline-first PWA.

## Decisions & the reasoning behind them

### Discipline: calisthenics, not tai chi
Tai chi is continuous 3D motion and cannot be taught with text and static images —
it requires licensed or self-filmed video, which makes it a content project, not a
software project. Calisthenics has objective structure (rep progressions) that can
be encoded, and a push-up is teachable from an image and a paragraph.

### User zero: me, returning beginner
Single user. No auth, no accounts, no onboarding, no privacy policy. The core loop
of a workout app is only discoverable by using it while sweaty and tired.

### Equipment: none. Hard constraint.
No purchases. No pull-up bar, no bands, no rings.

**Consequence, stated openly:** horizontal pulling strength is untrainable without
an anchor. v1 does not pretend otherwise. The Pull slot trains scapular retraction
and upper-back endurance (the posture half of the imbalance), and the app labels it
as postural work — *not* a pull ladder. Hiding the gap is how these apps do damage.

If a sturdy table or a doorway bar ever appears, the angle-based pull ladder drops
in without touching the engine:
`standing towel row → bent-knee table row → straight-leg → feet-elevated → tempo → archer`

## Content

**A rung is the same movement plus a modifier — not a different exercise.** This is
the core content decision. Every exercise stays simple and familiar; difficulty comes
from tempo, pauses, range of motion, leverage, and unilateral work. Those four levers
are what substitute for added load when you have no way to add load.

```
PUSH  (every rung is a push-up)
  1 hands high (counter)   2 hands low (chair)      3 knees
  4 full                   5 full, 3s down          6 full, 3s down + 2s pause
  7 feet elevated          8 diamond hands          9 archer

SQUAT  (every rung is a squat)
  1 assisted (hold doorframe)   2 bodyweight        3 3s down
  4 3s down + 2s pause          5 heels elevated (deeper range)
  6 split squat                 7 assisted single-leg    8 pistol progression

HINGE
  1 glute bridge          2 glute bridge + 2s pause    3 single-leg bridge
  4 single-leg, feet elevated   5 couch-anchored nordic negative
  6 nordic negative, longer eccentric

CORE  (time-based)
  1 dead bug    2 plank    3 side plank    4 hollow hold    5 hollow rock
  6 tuck L-sit progression

PULL  (postural only — time-based. Not a pull ladder; see Equipment.)
  1 prone Y raise   2 prone T raise   3 Y-T-W combo
  4 reverse snow angels   5 prone lat slides   6 end-range isometric holds
```

**Time-based ladders** (core, pull) substitute seconds for reps: `3×20s → 3×45s`,
then apply a modifier and reset to 20s. Same engine, different unit.

## The cycle — advances on training, never on the calendar

```
Day A — Push     (push ladder + postural)
Day B — Legs     (squat ladder + hinge ladder)
Day C — Core     (core ladder + postural)
→ A, B, C, A, B, C, … forever
```

Each pattern lands every 3rd day (~2.3×/week) with 48–72h recovery.

**There is no concept of a missed day.** The cycle position advances only when you
complete a session. Skip two weeks, open the app, and it says "Day B — Legs" exactly
where you left off. No streaks, no calendar heatmap, no red squares, no debt.
Returning after a long gap must feel identical to returning after one day — that is
precisely when the app most needs to feel easy.

Progress display: cycle position + a monotonic session count that never resets.

## Session shape (~12–13 min)

```
2 min    guided warmup — 6 movements × 20s, fixed sequence, no progression
10-11min 2 exercises × 3 sets · 24-36s work · 60s rest
```

At ~3s per controlled rep, a set is 15s at 5 reps and 36s at 12 reps. Six sets plus
rests plus warmup lands at 12–13 min across the whole rep range — so the rep cap
keeps session length bounded on its own. Duration is never something to manage.

## Progression engine

Double progression. Deterministic, auditable, ~150 lines. Every prescription is
traceable to logged history.

```
Within a rung:   3×5 → 3×6 → … → 3×12        (time-based ladders: 20s → 45s)
Advance a rung:  3×12 clean, twice           → next rung, reset to 3×5
Fast-track:      3×12 rated "easy", once     → next rung immediately (repeatable)
Hold:            missed target 2× running    → repeat the same prescription
Regress:         missed target 3× running    → drop one rung
```

**"Clean" is defined as: all three sets at target reps, AND last-set effort ≠ hard.**
The entire advance rule depends on this, so it is a single predicate in code.

**Reps cap at 12 by design.** Adding reps is the primary lever and it's the one that
keeps exercises simple — but past ~12–15 reps bodyweight work stops driving strength
adaptation and becomes muscular endurance. With no way to add load, reps-forever
means plateauing as "good at high-rep squats." At the cap, the engine switches lever:
apply the next modifier, reset to 3×5. Same movement, harder version, strength range
preserved.

*No LLM planning, no adaptive autoregulation.* Novel workouts every day are a bug:
they destroy the ability to tell progress from noise, and no model has a reliable
picture of accumulated fatigue.

**Calibration needs no onboarding quiz.** Every ladder starts at rung 1. The
fast-track rule self-calibrates in ~3 sessions of easy work that doubles as pattern
practice, and cannot overshoot because it only fires on *completed and easy*.

## Input — ~8 taps per session

| Action | Cost |
|---|---|
| Hit the target | one huge **Done** button |
| Missed the target | tap the rep number → stepper pre-filled at target (2 taps) |
| Effort | one tap — easy / ok / hard — **last set only** |

Mid-workout you are breathing hard with sweaty hands and the phone is on the floor.
Every tap is expensive. But the engine cannot run on the assumption that you hit
every set — it would march you up the ladder into movements you can't do.

Every exercise card shows **"Last time: 3×7"**. Free, and the most motivating string
in the app.

## Non-negotiable technical requirements

- **Timestamp-based rest timer.** Compute elapsed from a stored start time. Never
  trust `setInterval` continuity. A timer that dies on screen lock breaks the loop.
- **`navigator.wakeLock`** held for the duration of an active session.
- **Audible cue at rest-zero** — WebAudio oscillator beep (more reliable than speech).
- **`speechSynthesis`** for set/rest transitions. Built in, offline, zero assets.
- **`navigator.storage.persist()`** requested on install.

## Persistence

Source of truth is a **single human-readable JSON document** — deliberately not an
opaque DB. When the engine puts you on a rung that feels wrong, you open the file
and fix it instead of building an admin UI.

Durability: a small zero-dependency Node service owns a **SQLite database** in a
gitignored `db/` folder, and the client `PUT`s/`GET`s the same JSON document against
it behind a shared secret. No users table, no auth flow, no SQL migrations. Local-first,
last-write-wins — correct here because there is exactly one of me, so conflicts are
near-impossible. Solves backup and phone↔desktop sync in one move.

The document is stored as **append-only snapshot rows**, not normalised tables. The
codec already owns validation and the canonical shape, and `schemaVersion` lives inside
the JSON — normalising would create a second source of truth for shape and duplicate
all that validation for no gain at one user. Snapshots also give free version history,
and `sqlite3 db/app.db "SELECT doc_json FROM snapshots ORDER BY id DESC LIMIT 1"` still
hands back the hand-editable JSON, so the decision above survives intact.

Browser storage is not durable: iOS evicts IndexedDB under pressure and one "clear
site data" wipes everything. History loss isn't a degraded experience — the engine
loses all knowledge of ladder position and restarts from rung 1.

## Charts

Hand-rolled SVG, ~40 lines. No charting dependency for a few hundred data points.

**Do not plot reps over time.** In double progression you climb 5→8, advance a rung,
and reset to 5 — so a rep chart sawtooths and shows you getting *worse* every time
you actually get stronger. Plot a monotonic index, one line per pattern:

```
progressIndex = rungIndex × 8 + (reps − 5)     // rep span is 5..12, so 8 steps per rung
```

## Figures

Ten drawings, not forty — and now genuinely fewer, because a rung is a *modifier on
one movement*. Every push rung is a push-up; every squat rung is a squat. The pose is
shared and the overlay carries the difference.

```
Base pose pairs (start + end):  push · squat · hinge · prone · plank   = 10 drawings
Per-rung overlay:               elevation marker · hand-position dot · angle arc · tempo dot
```

Style is a rigid system, and the rigidity is what makes it look good: fixed 200×200
grid, single stroke weight, no shading, no faces, one accent color for the movement
arrow. Ten figures drawn to a system read as a design language; forty freehand
sketches read as amateur.

`stroke="currentColor"` gives dark mode for free. A CSS crossfade between the start
and end frames gives a 2-frame animated demo for zero extra assets.

**Hard rule:** `<ExerciseFigure>` renders a labeled placeholder box from day one, and
the whole app is built against placeholders. Drawing is never on the critical path.

## Stack

Vite + React + TypeScript. PWA, installed to home screen, service worker for offline.
Static deploy. No app store, no signing certs, no native build pipeline.

## Explicitly cut from v1

Daily reminder notifications · deload logic · multiple programs · exercise
substitution · body-weight and measurement tracking · Apple Health export ·
onboarding assessment · social anything.

## Known open risks

1. **The pull gap is real.** v1 does not train pulling strength. Accepted knowingly.
   The fix, whenever it's wanted, is a table you can crawl under.
2. **`speechSynthesis` voice availability varies** across iOS/Android. The beep must
   be the fallback — never speech-only.
3. **Modifier ladders need clear cue text.** "3s down + 2s pause" is only safe if the
   card says *where* the pause happens. Form cues carry more weight now that rungs
   differ by tempo rather than by shape.

### Resolved
- ~~Under-stimulation past bodyweight squats~~ → reps to 12, then modifier lever.
- ~~Nordic couch anchor~~ → confirmed available.
- ~~Definition of "clean"~~ → all sets at target AND last-set effort ≠ hard.
