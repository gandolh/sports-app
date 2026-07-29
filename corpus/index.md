# Corpus index — sports-app

Front door. Triage on the `summary:` lines below and open **at most 2–3** wiki
pages. See [CLAUDE.md](CLAUDE.md) for the conventions and the retrieval budget.

## Navigation

- [CLAUDE.md](CLAUDE.md) — schema, invariants, source-of-truth ordering
- [routing.md](routing.md) — which question goes to which layer
- [log.md](log.md) — chronological record of every meaningful change
- [lint.sh](lint.sh) — `bash corpus/lint.sh` to check health, `--index` to regenerate the catalog below
- [../SPEC.md](../SPEC.md) — the grilled v1 design; parent document of every brief
- [briefs/todo/](briefs/todo/) · [briefs/done/](briefs/done/) — work specs (see [wiki/status.md](wiki/status.md) for their state; don't read them wholesale)
- [todos/](todos/) — captured prose, pre-spec

## Wiki catalog

<!-- BEGIN CATALOG -->

- [wiki/architecture.md](wiki/architecture.md) — Module layout, dependency direction, and the pure-core/imperative-shell boundary that keeps the engine testable.
- [wiki/decisions.md](wiki/decisions.md) — Locked design and tech choices with the reasoning that settled them — read before proposing an alternative.
- [wiki/design-system.md](wiki/design-system.md) — Design tokens and the doctrine governing them — colour, type, spacing, motion, anti-patterns, and the floor-phone accessibility floor.
- [wiki/open-questions.md](wiki/open-questions.md) — Only the genuinely unresolved. Answered questions are deleted from here, not archived.
- [wiki/overview.md](wiki/overview.md) — What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
- [wiki/progression-engine.md](wiki/progression-engine.md) — How the app decides today's prescription — double progression, the rep cap, the modifier lever, and the exact advance rules.
- [wiki/status.md](wiki/status.md) — Dated snapshot of where every brief stands and what's next.
- [wiki/technical-decisions.md](wiki/technical-decisions.md) — Locked stack, storage, timer, audio and rendering choices — read before proposing an alternative implementation.
- [wiki/training-science.md](wiki/training-science.md) — Evidence base for the programme — what the five slots actually train, which muscles get nothing, and why cardio cannot fit in the session.

<!-- END CATALOG -->
