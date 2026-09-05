# corpus/ — conventions for this project

This is an LLM-maintained wiki for **sports-app**, a zero-equipment calisthenics
PWA. The human curates sources and asks questions; the LLM curates the synthesis
and tracks the work.

**Read [index.md](index.md) first.** Triage on each page's `summary:` line.

## Retrieval budget (a rule, not advice)

1. Read `index.md`, then **at most 2–3 wiki pages**.
2. Needing more than three is a signal that a page straddles topics and must
   split — not a licence to read more.
3. Never read `briefs/` or `todos/` wholesale. [wiki/status.md](wiki/status.md)
   holds every brief's state in one line. Open a brief only when you are about to
   execute it.
4. Prefer the `summary:` line over opening the page.

## Layout

```
corpus/
  CLAUDE.md      this file
  index.md       generated catalog — `bash corpus/lint.sh --index`
  routing.md     which question goes to which layer
  lint.sh        health check; exits non-zero on failure
  log.md         chronological record, newest last
  todos/         captured prose ideas (pre-spec)
  briefs/        todo/ · done/ · superseded/ — immutable work specs
  wiki/          the synthesis layer; the LLM owns this
```

## Source-of-truth ordering

When sources disagree:

1. The **actual code** wins over any wiki claim.
2. [wiki/decisions.md](wiki/decisions.md) wins for **product/programme intent**, and
   [wiki/technical-decisions.md](wiki/technical-decisions.md) for implementation.
3. A brief in `briefs/done/` wins over `wiki/` when the wiki hasn't caught up.
4. [`../SPEC.md`](../SPEC.md) is the **v1** design document and is **partly
   superseded** — it describes an adaptive engine the app no longer has. Read it for
   v1 reasoning; never treat it as current intent.
5. `wiki/decisions.md` wins over [wiki/status.md](wiki/status.md) for choices not
   formally revisited.

`SPEC.md` was rank 2 until 2026-07-29, when a second grill replaced the adaptive
engine with a fixed schedule. **Do not relitigate a `decisions.md` entry** without an
explicit revisit plus a `log.md` entry.

## Project invariants (load-bearing — check before proposing anything)

- **The prescription never adapts to what you logged.** *This replaced "the app
  measures nothing" on 2026-09-04 — see [wiki/reversals.md](wiki/reversals.md).* The app
  now records: logged sets, dates, a streak, a calendar, comparison against last time.
  What did **not** change is the direction of causation. `prescribe()` is a pure
  function of `sessionsDone` and nothing else, and **no logged value may ever reach
  it**. The moment it does, the fixed schedule stops being fixed and every number in
  `wiki/progression-engine.md` becomes a lie. This is the governing invariant and it
  outranks the rest of this list.
- **Zero equipment. No purchases.** No bar, bands, rings, or weights. A hard user
  constraint, reaffirmed three times. It is *why* there is no pull strength ladder.
- **A ladder rung is one movement plus a modifier**, never a different exercise.
  Difficulty comes from tempo, pause, range, leverage, and unilateral work.
- **The rotation advances on training, never on the calendar.** This half survives the
  2026-09-04 reversal and is the half that matters: dates, streaks and a calendar are
  now *displayed*, but a skipped day still advances nothing. Miss a fortnight and the
  next session is still the next session. The calendar reports; it does not schedule.
- **`client/src/domain/` still may not read the clock.** Dates enter through
  `client/src/persistence/` and are passed in, exactly as `completedAt` always was.
  Displaying dates did not license the pure core to call `Date.now()` — eslint still
  fails the build on it.
- **The prescription is a pure function of sessions completed.** Deterministic,
  clock-free, no LLM planning, no autoregulation in code. One interpolation, no
  branches.
- **Offline-first.** No session-critical path may require network — including `/login`.
- **State is one human-readable, hand-editable JSON document per user.** Not an opaque
  DB, and it holds nothing derived.

## Conventions

- Brief numbers are **stable for the life of the file** — never renumber on move.
- Briefs in `done/` and `superseded/` are **immutable**.
- Every wiki page carries `summary:` + `updated:` frontmatter.
- Standard relative markdown links, not `[[wikilinks]]`.
- Absolute dates (`2026-07-29`), never "yesterday".
- One concept per file; split past ~200 body lines.
- `TodoWrite` is the in-session list; `corpus/` is durable. Don't conflate them.
- Never commit corpus changes unless the user asks.

## Workflows

- **Capture** an idea → `todos/<slug>.md`.
- **Promote** → `briefs/todo/<NN>-<slug>.md`, self-contained enough for a fresh
  agent with no other context.
- **Work** a brief → grill open branches → plan → implement. Honor the brief's
  *Files you OWN / must NOT touch*.
- **Complete** → move to `briefs/done/` keeping the number, append an outcome
  note at move time only, add a `log.md` entry, fold durable findings into
  `wiki/`.
- **Verify before quoting.** A wiki page naming a path, function, or commit may
  have drifted. Check it exists before acting on it.
