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

- [wiki/adherence.md](wiki/adherence.md) — What the app assumes about the person using it — bad days, skipped days, rungs that are too hard, and the daily block that is easiest to drop.
- [wiki/architecture.md](wiki/architecture.md) — The three npm workspaces, the dependency direction across them, and the pure-core/imperative-shell boundary inside the client.
- [wiki/decisions.md](wiki/decisions.md) — Locked product and programme calls with the reasoning that settled them — read before proposing an alternative.
- [wiki/design-guardrails.md](wiki/design-guardrails.md) — The rules that keep the design system honest — the banned patterns, the floor-phone accessibility floor, and the four tests that enforce both mechanically.
- [wiki/design-system.md](wiki/design-system.md) — Design tokens and the doctrine governing them — colour, type, spacing and motion. The banned patterns and accessibility floor live in design-guardrails.md.
- [wiki/licensing.md](wiki/licensing.md) — Why the repository is AGPL v3.0, what the exercise reference cost to import, the unresolved chain of title behind it, and the public-domain substitute that would undo both.
- [wiki/open-questions.md](wiki/open-questions.md) — Only the genuinely unresolved. Answered questions are deleted from here, not archived.
- [wiki/overview.md](wiki/overview.md) — What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
- [wiki/programme.md](wiki/programme.md) — What the training actually is — the three-day rotation, what each session contains, the per-rung hold caps, and the cardio protocol.
- [wiki/progression-engine.md](wiki/progression-engine.md) — How the app decides today's prescription — the fixed 6-week-per-rung schedule, why it needs no input, and the interpolation that makes state a single integer per pattern.
- [wiki/reversals.md](wiki/reversals.md) — The three v3 reversals, the original reasoning each one overturned, and the cost each purchase carries — read before re-deriving a rule that was deliberately dropped.
- [wiki/status.md](wiki/status.md) — Dated snapshot of where every brief stands and what's next.
- [wiki/technical-decisions.md](wiki/technical-decisions.md) — Locked stack, storage, routing, timer and rendering choices — read before proposing an alternative implementation.
- [wiki/decisions-identity.md](wiki/decisions-identity.md) — How this app knows who is asking: the superseded shared-secret-and-nameplate design, and the Ward session that replaced it.
- [wiki/training-science.md](wiki/training-science.md) — Evidence base for the programme — what the five slots actually train, which muscles get nothing, the isometric and concurrent-training ceilings, and what the fixed schedule costs.

<!-- END CATALOG -->
