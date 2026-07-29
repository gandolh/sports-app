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
