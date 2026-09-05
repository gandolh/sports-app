# Log

Chronological, newest last. Absolute dates only.

## [2026-07-29] decision | v1 design settled by adversarial grill

Ran a full design grill before any code existed. Resolved: calisthenics over tai
chi (tai chi needs video, making it a content project); single user, no auth;
**zero equipment as a hard constraint** (reaffirmed after two pushes for a €25
doorway bar); daily ~12 min sessions on a rotating A/B/C cycle; deterministic
double progression; no streaks and no calendar.

Two places the user overrode the recommendation, both of which survived scrutiny:
daily-short over 3×/week (which forced the rotating cycle, and the rotating cycle
is what produced the no-missed-days design), and charts + guided warmup in v1
(both turned out ~10× cheaper than quoted — hand-rolled SVG and `speechSynthesis`).

Largest late change: **a ladder rung is one movement plus a modifier**, not a
different exercise. Reps cap at 12, then the engine switches to tempo/pause/range/
unilateral. This simultaneously kept exercises simple, kept adaptation in the
strength range rather than drifting to endurance, held sessions at 12–13 min, and
shrank the drawing work.

Recorded in [../SPEC.md](../SPEC.md).

## [2026-07-29] maintenance | corpus bootstrapped

Created the skeleton, `lint.sh`, `routing.md`, and the wiki spine
(`overview`, `architecture`, `decisions`, `status`, `open-questions`) plus a
`progression-engine` concept page. Filed briefs 01–11 in `briefs/todo/`
decomposing the v1 build.

## [2026-07-29] done | Brief 01 — scaffold ships; app is installable and offline-capable

Vite 8.1.5 + React 19.2.8 + TypeScript 6.0.3 + Vitest 4.1.10 + vite-plugin-pwa 1.3.0,
all exactly pinned. `npm run check` = typecheck + lint + tests.

Two deviations, both forced by facts rather than preference. **TypeScript 6.0.3, not
7.0.2:** `typescript-eslint@8.65.0` peer-requires `<6.1.0`, and the import-boundary
rule is the whole reason ESLint is present. **`brace-expansion` overridden to 5.0.8:**
8 high-severity advisories all traced to one DoS in `workbox-build`'s build-time glob
chain; the override clears `npm audit` and the build still generates the precache.

The purity guard came out stronger than specified — `src/domain/` is blocked from
importing the shell *and* from browser globals, `new Date()`, `Date.now()`, and
`Math.random()`. Verified by planting a file with all five violations (5 errors, then
reverted). This is load-bearing for brief 04's simulation harness.

Verified in a real browser rather than inferred: SW registered, manifest valid with a
maskable icon, and an offline reload served the shell from a 7-entry precache — with
an uncached fetch asserted to reject, to prove the offline emulation was genuine.

**Finding for brief 11:** `navigator.onLine` reported `true` while the network was
demonstrably offline. Sync must attempt-and-catch, never gate on it.

Brief: [briefs/done/01-project-scaffold.md](briefs/done/01-project-scaffold.md).

## [2026-07-29] done | Brief 02 — the domain type contract

`src/domain/types.ts` plus a realistic `midProgram` fixture. 14 tests green.

**Resolved the brief's open design question: `LadderState` is authoritative on read,
derivable for repair.** `deriveLadderStates(history)` is an explicitly invoked repair
tool, never automatic — running it implicitly would silently revert hand-edits, which
defeats the point of a hand-editable state file. Brief 04 must therefore not consult
`history` inside `applySession`.

Three additions beyond spec, all to spare later briefs from editing a file they are
forbidden to touch: `Settings`/`SyncSettings` (needed by 05, 07, 08, 11);
`Ladder.kind: 'strength' | 'postural'` as a **required** field so the pull ladder
cannot silently be presented as pull strength; and `Modifier.pauseAt` so "pause 2s"
cannot be expressed without saying where.

The fixture embeds a real push-ladder rung advance (10 → 11 → 12 → reset to 5), giving
briefs 04, 05 and 09 the one transition that distinguishes a correct chart from a
sawtoothing one.

Brief: [briefs/done/02-domain-types.md](briefs/done/02-domain-types.md).

## [2026-07-29] done | Brief 03 — five ladders, 35 rungs, cue-discriminability gate passed

`src/domain/ladders.ts` + 35 tests. Ids reconciled with brief 02's fixture verbatim,
no conflict. Tests go beyond structural invariants to assert cue *content*: every rung
must state a tempo even when normal, every pause must name both duration and location
in words, every rung needs a stop-the-set signal, and both nordic rungs must cue
anchoring, the slow eccentric, and the bail-out.

Deliberate SPEC deviation: `squat-05` keeps rung 4's tempo, because read literally
("heels elevated" at normal tempo) rung 5 would be *easier* than rung 4 and the ladder
would run backwards.

Convention to remember: **rung id numbers are 1-based, `getRung` is 0-based.**

**Also surfaced a defect in brief 02's own fixture** — `fixtures.ts` was authored
before `ladders.ts` existed and its ladder states are not reachable by replaying its
history under the engine rules (wrong rung indices, a target above `targetMax`, and a
rung advance below max). Filed as the wave-3 gate in
[wiki/status.md](wiki/status.md); it blocks brief 04, because an engine written against
an invalid fixture gets contorted to fit it.

Brief: [briefs/done/03-ladder-content.md](briefs/done/03-ladder-content.md).

## [2026-07-29] done | Brief 10 — figure system + all five pose pairs

`ExerciseFigure` + placeholder built first, drawings second, as the brief required.
25 tests. All five pose pairs completed (full, not partial, delivery).

The overlay system is the part that matters: `ElevationMarker` / `HandPositionDots` /
`AngleArc` / `TempoDot` compose from `Rung.modifier` alone, so new rungs need modifier
data rather than new drawings. That is what keeps the count at ten figures instead of
forty.

Notable judgement call: react-hooks v7's `static-components` rule false-positived on
registry-resolved dynamic dispatch; the agent worked around it locally with
`createElement` **instead of loosening the shared eslint config**. Correct instinct —
the purity/quality guards are project infrastructure.

Outstanding: legibility at ~120px needs a visual pass once brief 06 renders a real
screen. Tracked in the brief's outcome note.

Brief: [briefs/done/10-svg-figures.md](briefs/done/10-svg-figures.md).

## [2026-07-29] done | Brief 05 — persistence, with crash-safety asserted rather than argued

96 tests (codec 52, store 31, SettingsScreen 13). Save order is
serialise → parse-the-serialised-text → shadow write → read back and byte-compare *and*
re-parse → promote → verify → remove shadow. Verified by injecting failures at each key
and asserting the live key stays byte-identical; a storage layer that lies and truncates
on `setItem` is caught at read-back.

The corrupt-file path writes **nothing at all** — `storage.ops` asserted empty on load,
text byte-identical after repeated loads and a refused save, and the read-only latch
cannot be defeated by call order.

`serialise` is hand-rolled rather than `JSON.stringify(…, 2)` so the file is genuinely
readable and byte-stable — brief 11's round-trip test depends on the latter.

Deliberate leniency documented in the codec: history rung ids are not validated against
current content (ids are immutable, old docs must load), `sessionsCompleted` need not
equal `history.length`, `target` is not range-checked, and `_`-prefixed keys are allowed
as human notes in a format with no comments.

Brief: [briefs/done/05-persistence.md](briefs/done/05-persistence.md).

## [2026-07-29] maintenance | Wave-3 gate: fixture repaired and made provable

`fixtures.ts` was authored before `ladders.ts` and its ladder states were not reachable
by replaying its own history. Repaired, and made *provable* instead of re-asserted:
`midProgramStart` is now exported so brief 04 must assert
`history.reduce(applySession, midProgramStart) === midProgram`.

Five new tests in `types.test.ts` catch the bug class without needing the engine.
One of brief 05's tests hardcoded fixture values rather than deriving them — that
coupling was the real defect and is now fixed.

**Decision recorded:** time-based ladders step by **5 seconds** (20→45, six targets per
rung), not 1. A one-second step would mean 26 sessions per rung of planks and would
break `progressIndex`, whose `× 8` was the rep span. Both `targetStep` and
`stepsPerRung` derive from `unit`, so no type or content change was needed. See
[wiki/progression-engine.md](wiki/progression-engine.md).

**Plan correction:** brief 09 depends on **brief 04** (it consumes `progress.ts`), not
just 02 and 05. The wave plan was wrong; 09 moves to wave 5 alongside 06.

Whole-tree verification after the gate: typecheck clean, lint clean, 175 tests, build
emits a working service worker.

## [2026-07-29] decision | Durability revisited: SQLite snapshot rows replace the single-file blob

**This supersedes a decision in [wiki/decisions.md](wiki/decisions.md)**, recorded here
because reversing a locked decision requires an explicit note rather than a quiet edit.

Was: `PUT`/`GET` a single JSON file on a remote host. Now: a zero-dependency Node
service owns `db/app.db` (gitignored) through Node's built-in `node:sqlite`, storing the
same JSON document as **append-only snapshot rows**. The service and its own database
run wherever the app is deployed.

`node:sqlite` verified working locally on Node 24, which keeps the service at zero
dependencies — no `better-sqlite3` native build to compile or pin. It emits an
experimental warning; that is accepted, and must not be "fixed" by adding a dependency.

Snapshot rows rather than normalised `sessions`/`sets`/`ladders` tables: the codec
already owns validation and the canonical shape, and `schemaVersion` lives inside the
JSON, so normalising would create a second source of truth for shape and duplicate all
of brief 05's validation for no benefit at one user. It also preserves the
hand-editability decision — one `sqlite3` query still returns the editable JSON.

**Retention is capped at ~20 snapshots as a correctness-of-scale limit, not a tuning
knob:** each snapshot embeds the full history, so size grows linearly with sessions and
the database grows *quadratically* with retention × sessions.

Brief 11 was rewritten accordingly as
[briefs/done/11-sqlite-persistence.md](briefs/done/11-sqlite-persistence.md), replacing
the earlier remote-file version, and `db/` was added to `.gitignore`. **Deployment
specifics are intentionally kept out of this repo entirely** — this repo describes the
service and its local database, nothing about where or how it is hosted.

## [2026-07-29] done | Brief 11 — SQLite snapshot service, zero dependencies

28 server + 32 sync + 10 sync-UI tests. `node:sqlite`, WAL, `synchronous = FULL`,
insert+prune in one `BEGIN IMMEDIATE`.

Byte-identical round-trip proven against a real database file over a real socket, with an
adversarial payload and an explicit assertion that `JSON.stringify(JSON.parse(sent))
!== sent` — so the round-trip test cannot pass vacuously.

Two findings worth remembering: **retention prunes by `id`, not `created_at`**, because an
NTP correction can move the server clock backwards and "newest" must be a fact about
insertion order; and **`applyRemote` must preserve local `settings.sync`**, because the
sync address and secret live inside the synced document, so a naive pull would break
sync as a side effect of using it.

`timingSafeEqual` runs on SHA-256 digests rather than raw secret bytes — always 32 bytes,
so it is constant-time even for a wrong-length input, where a `length !==` guard would
leak the secret's length.

Brief: [briefs/done/11-sqlite-persistence.md](briefs/done/11-sqlite-persistence.md).

## [2026-07-29] decision | Effort input removed entirely; cardio gets its own day

**Two locked decisions superseded**, recorded here because reversing one requires a trail.

**1. No effort input anywhere.** The post-set easy-ok-hard tap is gone, and a proposed
pre-session difficulty picker was considered and also rejected — one level only. The
engine's sole input is *did you complete the prescribed work*.

This deletes the fast-track, which was the only calibration mechanism, and an onboarding
quiz / post-set rating / pre-session picker have now all been declined. **Calibration
therefore becomes descending:** ladders start mid-ladder and the 3-miss regress rule walks
the user down. The reasoning that settles it — a missed set is free information, a question
is not.

It also resolves the 25% hold over-advance by *deletion* rather than refinement. Worth
noting the simulation had concluded the effort signal was the only lever that moved that
number (605 → 16); removing the signal achieves the same end by a different route.

Accepted cost: the engine can no longer distinguish 3×12 with five reps in reserve from a
genuine 3×12, and the evidence says proximity to failure matters *more* at low load. That
autoregulation burden now sits with the user, knowingly.

**2. Cardio gets its own day, twice weekly.** Cycle A·B·C·Cardio·A·B·Cardio; 5 × 60s hard
/ 90s easy; lower-body movements only; one room, floor only. Supersedes "no cardio in v1".
Driven by an evidence review ([wiki/training-science.md](wiki/training-science.md)):
resistance work alone accrues effectively zero aerobic minutes, strength-only mortality
benefit already maxes out at 30–60 min/week, and strength + aerobic combined gives 40%
all-cause / 46% CVD reduction. Marginal return on more strength is small; on *any* aerobic
work it is large.

The user's original proposal — "more reps on an easy exercise, done fast" — does **not**
work as stated, and this is the most useful thing the research produced: intensity is the
active ingredient, not reps or speed. A high-rep set on an easy movement ends when the
muscle quits, not when the cardiovascular system is taxed. Tabata's own author published a
note that copying 20/10 intervals while dropping the intensity requirement produces no
VO2max gain. The prescription is therefore by breathlessness, never by rep count.

**Zero equipment reaffirmed a third time**, against specific no-purchase alternatives (a
broom handle across two chairs; a towel round a sofa leg). Both declined; all training is
one room, floor only. Standing consequence the app must state rather than hide: no pulling
strength is trainable, and lats, elbow flexors and grip get nothing.

**Corpus maintenance:** `decisions.md` passed the 200-line cap, so the technical half was
split into [wiki/technical-decisions.md](wiki/technical-decisions.md), and two now-superseded
entries (the old zero-equipment section, the ascending-calibration mechanism) were
reconciled rather than left to contradict the new ones.

## [2026-07-29] ingest | Design direction: "Instrument", and a real defect found

Design research produced a full brief; the durable half is
[wiki/design-system.md](wiki/design-system.md) (tokens + doctrine + accessibility floor),
the screen-level specs go into the UI brief.

Direction committed: **"the app is an instrument, not a coach"** — large tabular numerals
on near-black, exactly one signal colour, and nothing on any screen reads the clock. Chosen
partly because it is the only thing legible on a floor phone at arm's length, and partly
because it structurally cannot produce the template tells it lists.

The existing `#111418` / `#6ee7a8` both survived review (12.0:1, AAA at any size).

**Category convention conflicts with our constraints in five places**, and each is
resolved in the page: bottom tab bars (we have two destinations, and a persistent bottom
bar puts mis-tap targets under the primary action), browse-style home screens, calendars
and heatmaps (a calendar with gaps *is* a missed-day indicator even unlabelled), trophies,
and weekly-goal percentages.

**Two mechanical enforcement tests specified**, because intent is not enforcement: a grep
banning date formatting from `src/ui/`, and a snapshot asserting the home DOM is
byte-identical whether the last session was 1 day or 400 days ago.

**Defect found in shipped code (brief 10):** under `prefers-reduced-motion`,
`ExerciseFigure` renders the animated end-frame at `opacity: 0`, so it shows only the
*start* pose — silently discarding the movement information the two frames exist to
convey. Accessibility settings should not cost information. Fix: render both phases side
by side, labelled 1 and 2. Folded into the UI brief.

Typeface: **Archivo Variable**, self-hosted (~28 KB subset), explicitly not Inter.

Honesty note carried from the research: Dribbble, Mobbin and screensdesign all refuse
automated fetches, so the visual direction derives from shipped apps and documented design
principles rather than from inspected shots. Those links are flagged as un-verified in the
research output.

## [2026-07-29] todo | Briefs 12, 13, 14 filed for the post-decision rebuild

Three decisions (no effort input, cardio day, floor-only) plus a settled UI direction
turned into three briefs:

- **12 — domain v2** (in flight): delete `Effort`, seven-position cycle with two cardio
  days, mid-ladder starting rungs, and a real v1→v2 migration. The new property it must
  prove is **descending calibration** — a user started 3+ rungs above capability must walk
  down and settle without oscillating. That has never been tested and it is the entire
  justification for mid-ladder starts.
- **13 — content**: cardio (5 × 60s/90s, lower-body, prescribed by breathlessness rather
  than reps), the floor-only fixes (couch nordics → sliding leg curl, which also biases
  biceps femoris better; chair inclines → wall), and the extras pool led by prone trunk
  extension for the spinal erectors.
- **14 — UI**: TanStack Router + Query, Base UI, the six routes, and the two mechanical
  tests that enforce the no-guilt constraints instead of merely intending them.

**Briefs 06 and 09 are superseded by 14** — it absorbed the session player and progress
screen once the page structure and design system were decided. They move to `superseded/`
when 14 lands rather than leaving three briefs claiming the same files.

One tradeoff dissolved rather than accepted: the user chose expanded cues on the home
cards, which pushes `Start` below the fold on a small phone. Making `Start` a **sticky
bottom dock** (mirroring the player's) gives expanded cues *and* one-tap-to-begin, so there
is nothing to trade.

## 2026-07-29 — second grill: the app stops measuring, and half the codebase goes with it

A second adversarial grill on the whole concept, run against a much simpler product
statement from the user: one home page with today's training and three variants, all the
exercises shown one by one with a next button, **no counter, trusting the user**, a
dashboard, a calendar-style week page, weak auth, animated SVG figures, and **no time
tracking**.

Five collisions with locked v1 decisions, resolved in this order:

1. **"No counter, trusting the user" vs. the engine's only input.** `SetResult.actualValue`
   and the 3-miss regress rule were the sole mechanism by which a ladder could go *down*.
   Four options were offered — cap the ladder, two buttons per exercise, a fixed ramp, or a
   pre-filled counter. The user rejected all four: *"trust the user. Don't adapt."* That is
   now the governing decision and it deletes the adaptive engine outright.
2. **"No time tracking" vs. 12 timed rungs.** Kept as timed holds with tiered times, plus
   an **orientative countdown with a start button that gates nothing** — Next is always
   live. Converting the holds to reps was rejected, which was the right call: two of
   McGill's Big 3 are isometric by design.
3. **A calendar page vs. no dates anywhere.** Resolved as the **next 7 sessions**, no
   dates. The invariant survived completely intact — and then survived again when the user
   picked milestones and total-work-ever for the account page over a consistency chart, both
   of which key off session number rather than a clock.
4. **Three variants** became a per-session easy/medium/hard **load dial** (±2 reps / ±5s),
   independent of the schedule. This partly reverses "no effort input anywhere", and the
   reversal is sound for a reason worth recording: the old objection was that the *engine*
   read the signal badly. The engine no longer reads anything, so a picker that feeds
   nothing cannot corrupt anything.
5. **Auth** went from "single user, no auth" to multi-user with passwords that are
   **accepted and discarded**. Storing an unchecked password collects real reused passwords
   for no benefit whatsoever.

### The pacing law, which was a genuinely satisfying result

The user gave three step sizes at three different moments — +1 rep per 2 sessions, ~+1s
for core, +1s per 2 sessions for posture — and asked me to tweak the numbers as needed.
They are all one rule: **a rung takes ~6 weeks, and the step is the span divided by the
sessions in it.** Nothing the user specified had to be overridden. Expressed as
interpolation rather than accumulation, it also gives top-of-ladder cycling and
re-tunable per-rung caps for free, with no special case for either.

### Corrections I had to make mid-grill

- I presented a 3-day and a 6-day rotation as different options. `P·L·C·P·L·C` **is**
  `P·L·C` — the same sequence written twice. The only real variable was ordering.
- The arithmetic on the user's stated step exposed that **core rungs would take 50 weeks
  each** against push's 7, from two compounding causes (a 1s step across a 25s span is 25
  increments; core trained once per 7-day cycle). Fixing it produced the daily core and
  posture block, which the posture evidence independently supports.
- I claimed "where you are on each ladder" was the most useful account-page stat. The user
  declined it. Fair — the most recent milestone per pattern carries nearly the same
  information, and today's page already shows the patterns being trained.

### Research commissioned during the grill

- **Isometric ceilings are much lower than the ladders assumed.** McGill programs
  **10-second holds in a reverse pyramid**; transfer drops sharply past 60s and past ~2
  minutes it is meaningless or harmful. Caps set per rung: plank 60s, side plank 45s/side,
  hollow hold 45s, tuck L-sit 30s (wrist-limited, not abdominal-limited), prone Y/T 30s.
- **Concurrent-training interference is real and this programme sits in its risk zone** —
  it peaks with HIIT at 95–100% VO2max alongside resistance work at ≥10RM, which is exactly
  hard intervals plus 5–12-rep bodyweight sets. The mitigation is *order*, not distance:
  strength first, conditioning after.
- **Volume beats frequency for hypertrophy** — frequency's effect is compatible with
  negligible once weekly volume is matched. Combined with the fact that daily training
  makes legs/cardio adjacency unavoidable (unless legs days go back-to-back, breaking 48h
  recovery), that settles the rotation at `Push · Legs · Cardio` with cardio always
  *following* legs.

### Accepted risk, recorded not relitigated

With no adaptation the schedule prescribes rungs on a clock rather than on readiness. I
recommended cutting the injurious rungs or gating them behind a one-time unlock; the user
chose to rely on each rung's own safety cue. Standing, with one presentation consequence:
**on a `safetyCritical` rung the first cue renders first and visually separated.**

One thing improved without anyone choosing it: brief 15 removes the couch-anchored nordic
negatives for a *floor-only* reason (superseded brief 13 had already specified the sliding
leg curl replacement), so the first risky rung the user meets is a hollow hold at ~session
84 rather than a hamstring-strain mechanism at ~4 months.

### Corpus changes

Rewrote `decisions.md`, `progression-engine.md`, `architecture.md`, `overview.md`,
`technical-decisions.md`, `open-questions.md`, `status.md`, and the invariants and
source-of-truth ordering in `CLAUDE.md`. New page `wiki/programme.md`, split out when
`decisions.md` passed the 200-line cap — the lint gate caught both that and
`training-science.md` going over. **`SPEC.md` dropped from rank 2 to rank 4** in the
source-of-truth ordering: it describes an adaptive engine the app no longer has, and
leaving it at rank 2 would have made every future agent implement the wrong product.

Four open questions deleted as answered or dissolved (the fast-track over-advance, rung
discriminability, the missing interior fixed point, descending calibration). Five filed,
of which #1 — **is six weeks per rung right?** — is the only number in the programme with
no evidence behind it.

Briefs 06, 07, 08, 09, 13 and 14 superseded with outcome notes. Briefs 15–20 filed.
`lint.sh` now reads `package.json` to distinguish npm subpath specifiers from repo paths,
which had been producing a false stale-path warning.

Also: the repo had **zero commits** across ~30 files until this session. The v1 tree is now
committed as a baseline before any of the above touched code.

## 2026-07-29 — the v2 rebuild shipped: six briefs, three waves, 611 tests

Built briefs 15–20 through `plan-split-dispatch` in wave mode: `15 ‖ 17`, then
`16 ‖ 18 ‖ 20`, then `19`. Green at the end — typecheck, lint, 611 tests, `npm audit`
clean, a service worker with 10 precache entries, and **offline proven rather than
asserted** (a full Push session played to the finish screen with the network down).

Routing was senior-heavy (five opus, one sonnet) and that was the right call for this
particular set: a cross-module contract four briefs depend on, an irreversible migration
of persisted state, an auth surface, and a correctness call no test can catch. Only the
milestones module was mechanical enough for sonnet.

### The run's real output was the reports, not the diffs

Every brief was asked for an honest verdict on something it could not be tested on, and
**four of the six came back with a real problem**:

- **Brief 15** found that declared caps were **asymptotes, not values** — dividing by
  `sessionsPerRung` meant `fraction` topped out at `(per-1)/per`, so the 20–60s plank
  prescribed 59s and never 60. Fixed by dividing by `(per-1)`. It also found the finding
  I'd rank highest in the whole run: **the step between rungs is worth far more than the
  ±2-rep variant can absorb** (12 knee push-ups → 5 full push-ups), so difficulty is
  *front-loaded within each rung* rather than evenly spread as the wiki claimed. Filed as
  open question 7.
- **Brief 18** found `design-system.md` **contradicting the code it governs** — it
  claimed the countdown ring was the only continuously-animating element and that nothing
  animates on load, while the brief it was governing shipped a looping figure that does
  both. It correctly declined to edit the corpus and reported instead.
- **Brief 19** found five layout defects that only exist when the app is *operated*: the
  countdown ring 39px off-centre on the most-looked-at screen, the ring oversized enough
  that one clipped cue line was visible (and cues are the only thing distinguishing
  adjacent rungs), the safety cue rendering **seventh and below the fold on exactly the
  rungs where it is the only brake**, a finish screen with 370px of dead canvas, and a
  placeholder address that reads as a configured service.
- **Brief 20** found `programme.md` claiming a **per-side** side-plank dose that the
  rung's own cue splits *between* sides — 45s meaning ~22s each. Survived a whole design
  pass because nobody multiplied by two.

Two agents also correctly refused to overstep: brief 17 wrote that its instinct was to
add a per-user secret and flagged it rather than acting, and brief 18 declined to edit
the corpus page it had found wrong. Both are the ownership contract working.

### Corrections I made to the agents

- **Reversed brief 15's `push-07-pike`.** The implementer needed a floor-only replacement
  for the feet-elevated push-up and a pike push-up was a fair reading of the constraint —
  but it is a vertical press, not a push-up plus a modifier, so it broke a project
  invariant *and* brief 18's five-pose premise. Push took the shorter ladder, and the id
  numbering now keeps a deliberate gap at 07 because renumbering would rename shipped ids.
- **Moved the `Prescription → ExerciseRecord[]` mapping into the domain** as
  `toSessionResult`, after brief 15 flagged that it arguably belonged there. Without it
  brief 19 would have defined the shape of a recorded session a second time.

### Things worth knowing later

- **Brief 16 had to adopt the pre-v3 storage keys** to make its own migration reachable.
  The v3 keys are new, so without adoption an upgrading user's history would have
  silently vanished and brief 16 §1 would have been dead code.
- **The `?user=` parameter is required on `PUT`**, which the brief hadn't asked for: a
  mismatch check needs an independently stated target to compare the document against.
- Usernames are **rejected rather than case-folded**, because folding makes the stream key
  disagree with the document's own `username` field — which is precisely what `PUT`
  refuses.
- **Open question 4 is answered and the answer was surprising**, so it was kept as a note
  rather than deleted: a 2-second pause is legible at 120px not because the figure stops
  moving but because the two-frame crossfade snaps into focus. A true morph would look
  better *and weaken* the signal.

### Left open on purpose

Two design calls brief 19 declined to patch because they want a decision:
`POSTURAL_NOTICE` outweighs the plan it annotates on `/` and sits ~730px below the fold on
the pull player page; and long rung names wrap to three lines beside the figure, which is
the *norm* rather than an exception, since a rung is one movement plus a modifier.

Deploy integration is not started. The user asked mid-run whether the service could be a
Fastify REST API — it is already REST; whether it becomes Fastify is an open decision
against the zero-dependency call in `technical-decisions.md`.

## 2026-07-29 — reversing the zero-dependency service: Fastify, and three workspaces

The user asked whether the server could be a Fastify REST API with the frontend talking to
it over REST. **Half of that was already true** — the client makes four `fetch` calls
against `/api/state`, `/api/login` and `/api/health`, so the wire protocol was never the
question. What was being asked was whether to replace the implementation underneath.

I put the trade to the user rather than deciding it: at four endpoints Fastify replaces
about 300 lines of hand-rolled but *tested* HTTP plumbing, and the real cost is not code
aesthetics but that **deploying stops being a file copy and gains an install step on the
server** — which was the entire value of the zero-dependency choice. The user chose to
migrate, and additionally to restructure into **npm workspaces with `client`, `server` and
`shared`**.

`shared/` earns its place for a specific reason rather than as a habit: the username rule
currently exists in *both* `server/db.mjs` and `src/persistence/codec.ts`, kept honest by a
test asserting the two regexes match. One definition imported twice is strictly better than
two definitions plus a test that they agree. The constraint that follows is that `shared/`
holds **data shapes and validation, never behaviour** — it is a dependency of a browser
bundle and a Node service at the same time, so it may not import `node:*` or touch the DOM,
and that will be enforced by an ESLint rule rather than a comment, the same way the
`domain/` purity boundary already is.

**Filed as two briefs, not one.** 21 moves the tree and must end with all 611 tests still
passing; 22 swaps the HTTP layer with those tests as the contract. A behavioural change
hidden inside a hundred-file move is close to unreviewable, and "the move is green" is only
a meaningful signal if nothing else changed at the same time.

Two things brief 22 is most likely to break silently, so both are called out in it: Fastify
will happily parse and re-stringify JSON, which would destroy the byte-verbatim round-trip
the client's crash-safe save depends on; and Fastify logs requests by default, which would
quietly defeat the five tests asserting the password never reaches the database or the logs.

`decisions.md` is unchanged by any of this — the product did not move, only the plumbing.

## 2026-07-29 — brief 22 shipped: Fastify underneath, nothing different on the wire

The service is Fastify (`5.10.0`). `npm run check` is green at **614 tests** — the 73 server
tests all pass **unchanged**, four were added, and **not one file under `client/` changed.**
That last fact was the brief's premise and it held: the client makes four `fetch` calls and
needed no edit, which is what "the REST contract does not change" has to mean to be worth
saying.

**The migration's value was almost entirely in the tests it had to satisfy.** Brief 17's
suite was written against wire behaviour rather than implementation, so it survived a total
rewrite of the layer beneath it. That is not luck; it is what the effort spent on those
tests bought, cashed in eleven briefs later. Nothing about a green run on a *new*
implementation would have been believable otherwise.

**Four framework defaults had to be switched off, and each was mutation-tested.** Fastify
re-serialises JSON (which would silently destroy the byte-verbatim round trip the client's
crash-safe save depends on), synthesises `HEAD` for every `GET` route (turning today's
`HEAD /api/state` 405 into a 200), runs hooks globally unless scoped (which would put the
`401` after validation), and logs every request. Flipping each switch back was verified to
fail a test — 9 failures for the re-serialisation one.

**The logging test did not have teeth on the first attempt, and the reason is worth
remembering.** pino writes to file descriptor 1 *directly*, so an in-process spy on
`process.stdout.write` reported a perfectly clean run with `logger: true`. Worse, Fastify's
request log does not include the body, so even a working spy would not have found the
sentinel password — the assertion had to become "no request line reached these pipes at
all", checked by spawning the real service as a child process. This is exactly the failure
mode the brief warned about: **a migration that quietly defeats a security test while
leaving it green.** It took two attempts to actually avoid it.

Writing that test also found a **sixth** unguarded behaviour: an unauthorised caller using
the wrong method on a guarded route was answered `401` rather than the `405` that would
reveal the route exists — correct, but nothing tested it. Removing the check left all 77
tests green. There is a test now.

**Validation is schema-driven from `shared/api.ts`** — TypeBox, so one declaration is both a
JSON Schema for Fastify's AJV and a TypeScript type. The username schema is built from
`USERNAME_PATTERN.source` rather than a copy of the pattern, so the regex and the schema
cannot drift. Compilation stays in the service: `TypeCompiler` uses `new Function`, and
`shared/` has to work under a browser CSP. `StateDocumentEnvelope` is three fields and
stops there — a schema for the whole `StateDoc` would make the service a second source of
truth for the document *and* reject documents from a future `schemaVersion` it is meant to
store blindly.

**The brief's `server/src/db.ts` was not followed**, deliberately. The files stayed
`server/*.mjs` in place, because moving them would have meant editing the assertions that
are the migration's only proof and would have moved the `db/` directory `db.mjs` derives
from its own location. `eslint.config.js` had already called this: its Node-globals block is
scoped `server/**/*.mjs` with a note saying it is about the runtime rather than the HTTP
library and should survive brief 22 unchanged. It did. Both ESLint boundary blocks were
re-proved by making them fail, as brief 21 established.

**And the bill, which was known in advance:** the service has a dependency tree now, so a
deploy needs `npm ci --omit=dev` before `node state-server.mjs` will start. Copying files is
no longer enough. That is the whole cost of the decision, it was accepted knowing about it
on 2026-07-29, and it now belongs to the deploy brief. Storage was untouched — `node:sqlite`
is built in, `db.mjs` is a port and not a redesign.

---

## 2026-07-30 — Five questions answered, the theme goes white, and the deploy exists

No brief. Three changes made directly, plus the answers that unblocked one of them.

### The user answered five of the six open questions

Asked whether all briefs were done and what was still open, the user closed 1, 2, 3, 5
and 6 in a handful of sentences. Each is now a section in
[wiki/decisions.md](wiki/decisions.md); [wiki/open-questions.md](wiki/open-questions.md)
holds only question 7.

- **1 — is six weeks per rung right?** *"Don't make assumptions about continuity. I will
  try to do it daily, but there might be some days when i skip. After i skip, i will go
  to the next session in the queue."* This dissolves the question rather than answering
  it. The sharp version of Q1 was that "six weeks" silently assumes daily training and
  the app cannot notice a three-a-week user taking two years — the answer is that the
  app was never promising six weeks, only a step size. The queue is the contract. No code
  changed, and the constants stay re-tunable.
- **2 and 3 — is the cue text a strong enough brake, and will the squat ladder stall?**
  *"It's ok if it gets difficult"* and *"If it's dangerous, the player can skip it by
  pressing next."* The brake is **Next**, not the prose — a stronger mitigation than the
  one recorded on 2026-07-29, and free, because the app measures nothing. Recorded as a
  constraint on future work: nothing may ever count, flag or display a skip, because that
  is what this rests on. The intermediate squat rung is not being added.
- **5 — does the daily core and posture block survive real use?** *"yes, it's important
  to have some exercises for daily posture and core."* Kept at full frequency; all three
  alternatives rejected. Moving it *before* the strength work is the one that looks free
  and is not — it would put low-intensity holds ahead of the main work, which the
  concurrent-training ordering exists to prevent.
- **6 — should the side-plank cap rise?** *"yes, it should rise."* 15→45s total became
  **30→90s** (`SEC_30_90` in `ladders.ts`), which is 15→45s per side against norms of
  65–97s. It is now the only rung above the front plank's 60s ceiling, which is
  consistent rather than exceptional: the cap governs one continuous hold and a side
  plank is two. The rung's third cue was rewritten to say the clock is a total, so 90
  cannot be misread as per-side. The milestone label moved with it.

**Question 7 survives all of this, and it is worth saying why**, because the answers look
like they should have killed it. 2 and 3 were about whether the user will *accept* a hard
rung; 7 is the claim that the interpolation **misrepresents where difficulty sits inside
a rung** — a smooth ramp drawn over a step function. Accepting hard sessions does not make
a wrong curve right.

### Dark → white

The user asked for a white theme, reversing an explicit doctrine line ("No light theme.
One user, 7am, dim room. Scope with no user"). Reversed, and recorded in
[wiki/design-system.md](wiki/design-system.md).

**It could not be an inversion.** `#6ee7a8` is 1.5:1 on white, so the accent was
re-chosen rather than re-tuned — `#0b6b3f`, same hue, 6.6:1. `--warn` likewise: the amber
was 1.9:1. Everything else in the design system survived untouched, which is the useful
signal — the system was never actually about being dark.

The edit itself was **one file**, which is exactly the payoff `noHexColors` was written
for. Then two things turned up underneath it:

- **`--text-3` on `--surface-2` fails if you only check against `--bg`.** It is the
  `/login` placeholder. The against-white figure was a comfortable 4.8:1 and the real one
  was 4.25:1. Fixed by darkening the floor to `#646c75`; the page now quotes ratios
  against the surface each token is *painted on*, not against the canvas.
- **`noHexColors` had been passing vacuously for `app.css` since it was written.** Vitest
  stubs CSS modules to `''` by module id, so `app.css?raw` matched the glob, returned no
  bytes, and a grep over nothing passed. `css: true` in `client/vite.config.ts` fixes it,
  and `app.css` is now genuinely checked (it was clean). Generalisable: **a test that
  greps files it failed to open is green and worthless** — assert the input is non-empty.

Added `client/src/ui/__tests__/contrast.test.ts` (20 cases): parses `tokens.css`,
composites the `rgba()` washes over their real backdrops, asserts 4.5:1 / 3:1 pair by
pair, and asserts the *ceiling* on the ring track so the documented sub-3:1 exception
cannot be "fixed" later. 614 → 634 tests.

### The deploy

Built at `~/projects/vps-deploy/projects/sports-app/` (`deploy.ts`, `.env.example`,
`.env`, `README.md`), plus the Caddy routes and a one-line `hasServer` registration in
`vps-deploy/src/projects.ts`. Modelled on public-resource-map, the closest existing shape
(SPA + Fastify + sqlite + pm2).

**Serving under a sub-path needed a source change here**, and it is the only one:
`SPORTS_APP_BASE` now drives the Vite `base`, the PWA manifest `start_url`/`scope`/`id`,
the service worker's `navigateFallback`, and the TanStack Router `basepath` — four things
that must agree exactly. Default `/`, so dev, preview and every test are unchanged. The
deploy verifies the first two after building, because a wrong base fails silently and
completely: every asset 404s and the page is blank with a clean server log.

Four things worth keeping:

- **The DB path is the dangerous one.** The service defaults to `<repo>/db/app.db`, which
  under `SERVER_DIR` sits *inside* the rsync mirror — `rsync --delete` would destroy the
  user's entire training history on the second deploy. `SPORTS_APP_DB` points at
  `/srv/sports-app-api/data/app.db` and `--exclude=/data` is anchored. There is no backup
  job; move one and you must move the other.
- **Port 8794, not the service's own 8787** — farm-valley's sim server already holds that
  on this box.
- **`npm ci --omit=dev -w @sports-app/server --include-workspace-root`.** Unscoped it
  would install the client's React tree on a box that never runs it; scoped it is 58
  packages. Verified locally end to end before writing it in: rsync subset → install →
  boot → `/api/health` 200 → DB created at the out-of-tree path.
- **Two secret leaks found and fixed in review of my own script.** The shared secret was
  being echoed to the terminal by the command logger *and* passed in the `ssh` argv, where
  it is readable via `ps`. It now goes over stdin with a redacted label, and the `.env` is
  written under `umask 077`. A dry run is asserted not to contain it.

**No build-time API URL, deliberately.** Sync is optional and the settings field's
*emptiness* means "same origin", which is load-bearing in the app's own design — so the
address and secret are typed into `/account` once per browser rather than baked in. That
is a contract with a human, and it is written down in both READMEs.

**The deploy has not been run.** It typechecks and dry-runs clean; SSH, the Node version
check, the remote `npm ci`, pm2 and the Caddy reload are all unverified against the real
server.

### 2026-07-30, later — the floor-phone sizing model is retired

The user looked at the app on a laptop and said the primary button was too big, then, after
a first fix, scoped the devices: *"The expected devices are smarthphones and desktop. You
don't need to over-extend the buttons for those because they got good accuracy."*

That invalidates a whole cluster of numbers, not one button. The floor-phone model — a
sweaty finger aiming at a device on the ground, viewed obliquely mid-exhale — was the sole
justification for a **96px primary, 24px of mandated dead space, and a 120px exclusion
zone**. It was plausible and never confirmed.

Now `--tap-min: 44px`, `--tap-row: 48px`, `--tap-primary: 56px`, `--fs-btn: 19px` (from
24px — 24px inside a 56px control fills it rather than sitting in it), the primary's radius
steps `--r-lg` → `--r-md` (20px on 56px is 4px off a pill, a named tell), and the footer gap
drops `--sp-6` → `--sp-4` because it was dead space rather than rhythm. **44px is a hard
floor** — WCAG 2.2 AAA target size — so this stops there rather than at "looks tidy".

**The instructive part is that my first attempt was wrong in a way that looked right.** I
gated the old sizes behind `(hover: hover) and (pointer: fine)`, shrinking the primary on
desktop and leaving phones at 96px, and argued for modality over viewport width. The
argument was fine and the premise was not: it preserved a number nobody wanted on the
device the app is mostly used on, and left two sizes to maintain. Recorded in
[wiki/design-guardrails.md](wiki/design-guardrails.md) as a shape to watch for — **when a
rule's justification is wrong, change the rule; do not add a breakpoint that hides it on one
device.** There is now no per-device override of control sizes anywhere.

**Two things deliberately survived**, since they were bundled with the retired model and are
independently justified: the **sticky footer** (the next action is always in the same place
without scrolling, on screens whose cue list is taller than the viewport) and the **reach
ordering** that puts the primary bottom-centre and the destructive control top-right (a
reaching arm occludes top-centre regardless of how accurately it points). Type sizes were
left alone — those are about viewing distance, not aim.

### 2026-07-30, later still — brief 23 written: the figures get a rig

Researched the animation system against `~/projects/game-engine`, then grilled the
result into [briefs/todo/23-figure-rig-and-morph.md](briefs/todo/23-figure-rig-and-morph.md).
Nothing implemented.

**The engine turned out not to be the answer.** It has easing curves, an injected-time
tween, an `AnimationClip`, and Catmull-Rom corner smoothing — and the useful output was
not a technique to copy but a **measurement**. `figures/motion.ts` claims a morph is
impossible because the poses "have different path shapes… nothing to tween
geometrically". That is wrong: the poses are joint dictionaries, and three of the five
figures already have identical topology. The real blocker is that **bone lengths are not
preserved between the two poses** — `push` arm −44%, `hinge` torso +26%, `squat` leg
−37% — because the pairs were drawn as independent stills, not as one skeleton twice.
Four of the five worst cases are anatomically impossible; only the squat's arms are real
foreshortening.

**Two pieces of maths did the deciding, and both killed a cheaper option.** A chord is
shorter than its radius, so lerping joint *coordinates* collapses `prone`'s arm to 26%
of its length mid-sweep even after the lengths are corrected — which makes angle
interpolation the only correct choice rather than a preference. And the measured sweeps
showed `push`'s limbs barely rotate (4°, 0°, −8°): its hands and feet are **planted**
while the torso descends, so the elbow is not authored, it is **solved**. That splits
the figures into IK (planted endpoint: push, plank, hinge legs, squat legs) and FK
(free swing: prone arms, squat arms) — a distinction I missed in the first research pass
and which makes this a substantially bigger job than the "afternoon of geometry" I
initially estimated. Said so.

**The architecture survives intact**, which is the good news. `figures/index.ts` forbids
a JS loop ("this renders beside a live countdown on a phone") and forbids a figure
animating itself, so `motion.ts` samples the timeline, solves FK/IK per sample, and
emits per-bone `@keyframes` — JS once per render, never per frame, no new CSS features.
`buildTimeline` is untouched and every assertion about it must still pass; its own
docstring already anticipated "a future morphing renderer would consume the same
timeline".

**Art direction, from the user's reference image** (a game stickman with spiky hair and
baggy orange trousers): took the silhouette ideas, refused the palette. A hair spike and
a trouser flare, `currentColor` at `STROKE_WIDTH`, unfilled — both justified
functionally rather than decoratively (the spike is a stationary landmark for `prone`'s
150° sweep; the flare marks the hip, an invisible vertex that carries the most
information in `hinge` and `plank`). Colour would need a new token, a contrast pair and
a `decisions.md` revisit, and was rejected. I declined to identify the source game
rather than guess, and flagged that copying a recognisable character into a deployed app
is a different thing from taking stylistic cues.

**Deliberately deferred: easing the turnaround (R3).** The loop reverses direction
instantly at the bottom, which no body does, and linearity is enforced by an actual test
rather than just a doc rule. Left alone because 30 of 35 rungs have no pause, so easing
all of them risks 30 rungs reading as lightly paused — and because the rig may dissolve
the problem by itself, a rotating limb reading more organically than a translating
point. One variable at a time.

**A third vacuous test found**, in the same family as the CSS-glob one: the
reduced-motion assertion in `ExerciseFigure.test.tsx` queries by
`.exercise-figure__frame--start` and then asserts that element has that class — always
true. Its name also contradicts the CSS, which holds the `end` pose. Brief 23 fixes it.
The generalisable shape is now stated twice in the corpus: **a test that greps files it
failed to open, or asserts the selector it just queried, is green and worthless.**

## [2026-09-04] decision | v3 visual direction: the category standard, and three invariants reversed with it

Ran an Impeccable direction round (seed `197b2dd1`, mode Operate, code-led) against a
brief of "keep the business idea, think of a better design", with openGym offered as
inspiration. Four worlds were built as live phone mockups carrying real ladder content
rather than described in prose: **the Crag Guidebook** (the roll's assignment — 35 rungs
as 35 graded routes, a fixed grade ramp, the topo line as the movement path, and a
guidebook's native voice for access and safety notes), **the Physio Handout**
(Impeccable's pick), **Split-Flap Concourse** (a competitive challenger), and **the
category standard** played straight. Five further challengers were declined, each
donating one discipline before it left.

**The user took the standing exit.** Convention is now the commitment: dark ground,
gradient progress ring, streak grid, stat tiles, bottom tab bar, Inter throughout,
executed at full fidelity without irony. **The craft bar is openGym** — light/dark
themes, custom iconography, eight accent colours, "designed, not assembled".

The direction round is recorded because the *reasoning* is worth keeping even though the
grounded directions lost. Two findings survive the choice and are worth more than the
cards they came on:

- **A guidebook's access-note voice was the only vocabulary any world offered for the
  app's three honest warnings** (`POSTURAL_NOTICE`, the cardio dose limit, the
  safety-critical first cue). The chosen direction has no such slot, and the warnings
  still have to live somewhere.
- **Every rung's fourth cue is already a stop rule** — "stop the set when your hips
  sag", "stop the clock when your shoulders creep toward your ears". A physio sheet has
  a conventional boxed slot for exactly that. Nothing in the category standard does, and
  the shipped app buries it as cue four. This is a content structure the ladders already
  have and no design has ever surfaced.

**Three reversals, taken deliberately and at the user's explicit direction.** Each is
recorded in `decisions.md`; none should be treated as a design detail:

1. **"The app measures nothing" is reversed.** It was the top-ranked product decision.
2. **"No dates anywhere in the app" is reversed.** Dates, streaks, missed days and a
   weekly-goal percentage are in scope. `noDatesInUi.test.ts` and the time-invariance
   snapshot are deleted rather than weakened — a test kept while its rule is gone is
   worse than no test.
3. **Comparison affect is admitted** — "last time: 7" and an estimated 1RM. The rule
   against green-vs-red comparison was argued as "guilt with extra steps"; it loses.

**Stack:** Tailwind + Framer Motion + anime.js, at the user's choice. Tailwind replaces
`app.css`, which retires `noHexColors.test.ts` in its current form. The **contrast test
survives and must be re-pointed at the Tailwind theme** — it is the only mechanical
guard left on the palette once the hex-literal rule is gone, and it is the one that
caught the dark→white accent failure.

`PRODUCT.md` was written at the repo root during this round (the direction flow gates on
it) and now carries the category-standard commitment as a brand commitment.

## [2026-09-04] build | briefs 24–27: the category standard, shipped

Ran the v3 direction as four briefs in waves (`24a ‖ 26 → 24b → 25 → 27a → 27b`),
dispatched to subagents with the controller verifying each wave against the integrated
tree rather than trusting the agents' own reports. **704 tests at baseline → 1115.**
Typecheck clean, lint clean, and the client builds at both `/` and `/sports-app/`.

**Two rate-limit terminations mid-run**, one on each model tier. Neither lost work: 27a
had finished its code and died writing its report. Worth knowing the failure is
survivable and that the tree, not the agent's summary, is the source of truth.

### The repo had not built since 2026-08-13, and nobody knew

`0d7d4f3` ("SAVE") converted `Prone.tsx` from a `ProneFigure` component to a `PRONE_RIG`
data export while `figures/index.ts` still imported the component. That broke
`npm run build` and `npm run typecheck` for three weeks. **It went unnoticed because
Vitest does not typecheck and no test renders a prone figure**, so 704 tests stayed green
over a tree that could not be built. The generalisable shape, and it is the third of its
family in this corpus: *a green suite is not a green repo.*

Fixed by restoring the component verbatim from `5bb9e6b` alongside the rig, so brief 23
loses nothing and deletes the old renderer when its morph lands. A subagent had instead
stubbed `ProneFigure` to return `null` — which compiles, takes typecheck from 3 errors to
2, and **silently ships the postural exercise with no figure at all**. Reverted. Prefer
the loud restore to the quiet stub.

### What the review gate caught that the briefs did not

- **The eight-accent system was unreachable.** `theme.ts` was complete, correct, and
  imported by nothing; `index.html`'s cold-start script stamped what was stored, but no
  screen could change it. `contrast.test.ts` was meanwhile proving all sixteen palettes
  legible. **Legible and reachable are different claims, and only one had a test.** An
  Appearance section on `/account` now owns both settings, with three tests.
- **A swatch that lies is worse than a name that is true.** The first version of that
  picker stamped `data-accent` per button to preview each hue. Every accent block is
  `:root[data-accent='…']`, so it matched nothing and all eight dots rendered the
  accent already in use. Element-scoping them would mean duplicating the theme logic
  into each block; the picker is named options instead, and the app itself is the preview.
- **`StreakPill` had an `aria-label` on a bare `<span>`** with both children
  `aria-hidden` — the generic role does not carry an author-supplied name, so the element
  looked at most often was never announced. `Ring` and `Heatmap` already set `role="img"`
  on the same shape; this was the one place it was dropped. Testing-library's `getByText`
  reads text content rather than the computed accessible name, which is why nothing
  caught it.
- **`noHexColors.test.ts` caught the controller** writing a hex triplet inside a comment.
  Working exactly as intended.

### Decisions taken during the run

- **Malformed `logged` is rejected, not clamped.** The app saves back what it loaded, so
  truncating a too-long array would delete a recorded set and persist the deletion. The
  precedent already existed: `cyclePosition` reports rather than clamps. The cost is that
  a hand-edit typo in a display-only field blocks training until repaired — **left open
  for the user**, since it cuts against "arrive with the answer already made".
- **The service accepts any `schemaVersion`, unchanged.** It never gated on one, not for
  3-vs-2 either; migration ownership already sat with the client. `server/**` gained tests
  and comments recording that this is the design working, and no functional change.
- **`noHexColors.test.ts` survived** rather than being retired as the direction round
  predicted. Tailwind v4 is CSS-first, so the palette stays in `tokens.css` and the test
  keeps working — it now also catches arbitrary-value classes like `bg-[#123456]`.
- **`contrast.test.ts` grew to 352 assertions** (22 pairs × 16 palettes). Building it
  found a real defect in the reference artifact: its accent switcher writes an inline
  style on `documentElement`, overriding both theme blocks, so its light mode painted
  dark-mode mint on white at 1.8:1. The light eight were re-derived at ~6:1; the dark
  eight are the artifact's, verbatim. No threshold was lowered and no pair dropped.

### Deleted, and why nothing replaced them

`noDatesInUi.test.ts` and `timeInvariance.test.tsx` enforce rules that no longer exist.
Deleted rather than weakened — a test outliving its rule tells the next reader something
false. **The half of time-invariance that survived the reversal was re-tested**, though:
`screens.test.tsx` now asserts the same session is prescribed after a fortnight away as
after a night's sleep. The rotation still advances on training and never on the calendar;
only the screen's description of you changed.

`app.css`, `Screen.tsx`, `Notices.tsx` and the twelve-alias token shim are gone.

### Open

Brief 23 is still mid-flight and is the only thing in `todo/`. The rig is authored and
tested; the crossfade it replaces is still what renders.
