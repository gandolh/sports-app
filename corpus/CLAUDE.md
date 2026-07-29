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
2. [`../SPEC.md`](../SPEC.md) wins for **product/design intent** — it is the
   grilled, user-approved v1 design and the parent document of every brief.
3. A brief in `briefs/done/` wins over `wiki/` when the wiki hasn't caught up.
4. [wiki/decisions.md](wiki/decisions.md) wins over
   [wiki/status.md](wiki/status.md) for choices not formally revisited.

`SPEC.md` sitting at rank 2 is deliberate: this project's design was settled by an
adversarial grill before any code existed, and the reasoning behind each choice is
recorded there. **Do not relitigate a SPEC decision** without an explicit revisit
plus a `log.md` entry.

## Project invariants (load-bearing — check before proposing anything)

- **Zero equipment. No purchases.** No bar, bands, rings, or weights. This is a
  hard user constraint, reaffirmed after pushback. It is *why* v1 has no pull
  strength ladder.
- **A ladder rung is one movement plus a modifier**, never a different exercise.
  Difficulty comes from tempo, pause, range, leverage, and unilateral work.
- **The cycle advances on training, never on the calendar.** There is no concept
  of a missed day, no streak, no heatmap. Any feature that reintroduces guilt
  mechanics contradicts a locked decision.
- **The progression engine is deterministic and pure.** No LLM planning, no
  adaptive autoregulation. Every prescription must be traceable to logged history.
- **Offline-first.** No session-critical path may require network.
- **State is one human-readable, hand-editable JSON document.** Not an opaque DB.

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
