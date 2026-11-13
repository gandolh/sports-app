# Corpus index — sports-app

Front door. Triage on the `summary:` lines below and open **at most 2–3** wiki
pages. See [CLAUDE.md](CLAUDE.md) for the conventions and the retrieval budget.

## Navigation

- [CLAUDE.md](CLAUDE.md) — schema, invariants, source-of-truth ordering
- [routing.md](routing.md) — which question goes to which layer
- [log.md](log.md) — chronological record of every meaningful change
- [lint.sh](lint.sh) — `bash corpus/lint.sh` to check health, `--index` to regenerate the catalog below
- [../SPEC.md](../SPEC.md) — the grilled v1 design, partly superseded (see CLAUDE.md)
- [briefs/todo/](briefs/todo/) · [briefs/done/](briefs/done/) — work specs, run in number order (restarted at 01 on 2026-11-02); [wiki/status.md](wiki/status.md) has where things stand. Don't read them wholesale
- [todos/](todos/) — captured prose, pre-spec

## Wiki catalog

<!-- BEGIN CATALOG -->

- [wiki/adherence.md](wiki/adherence.md) — What the app assumes about the person using it — bad days, skipped days, rungs that are too hard, and the daily block that is easiest to drop.
- [wiki/architecture.md](wiki/architecture.md) — The three npm workspaces, the dependency direction across them, and the pure-core/imperative-shell boundary inside the client.
- [wiki/decisions-identity.md](wiki/decisions-identity.md) — How this app knows who is asking — local accounts on the state service with "Sign in with Ward" as a linked second way in (2026-10-13), the Ward-session-only design it revised, and the superseded shared-secret nameplate before that; why the stream key is the signed-in username and never a query parameter.
- [wiki/decisions-redesign.md](wiki/decisions-redesign.md) — The two product decisions the Up first redesign (approved 2026-11-13) changed, each with the old line kept: the places on a top bar from 840 px with a gradient ring in one hue and solid buttons, and no tracked capitals.
- [wiki/decisions.md](wiki/decisions.md) — Locked product and programme calls with the reasoning that settled them — read before proposing an alternative.
- [wiki/design-guardrails.md](wiki/design-guardrails.md) — The rules that keep the design system honest — the banned patterns, the floor-phone accessibility floor, and the four tests that enforce both mechanically.
- [wiki/design-system.md](wiki/design-system.md) — Design tokens and the doctrine governing them — colour, type, spacing and motion. The banned patterns and accessibility floor live in design-guardrails.md.
- [wiki/design-up-first.md](wiki/design-up-first.md) — What the Up first redesign (brief 05, approved 2026-11-13) changed in the design system: the grounds and lines, the new tokens, the ring's hue, the layout from 840 px, the solid primary and sentence-case labels.
- [wiki/licensing.md](wiki/licensing.md) — Why the repository is AGPL v3.0, what the exercise reference cost to import, the unresolved chain of title behind it, and the public-domain substitute that would undo both.
- [wiki/open-questions.md](wiki/open-questions.md) — Nothing open as of 2026-10-07. Questions 8 and 9 were answered on 2026-09-04; 7 landed on 2026-10-07 and is deleted.
- [wiki/overview.md](wiki/overview.md) — What sports-app is in one paragraph, who it's for, and the constraints that shaped it.
- [wiki/programme.md](wiki/programme.md) — What the training actually is — the three-day rotation, what each session contains, the rep ladders rung by rung (with the three in-between rungs of 2026-10-07), the per-rung hold caps, and the cardio protocol.
- [wiki/progression-engine.md](wiki/progression-engine.md) — How the app decides today's prescription — the fixed 6-week-per-rung schedule, why it needs no input, and the interpolation that makes state a single integer per pattern.
- [wiki/reversals.md](wiki/reversals.md) — The three v3 reversals, the original reasoning each one overturned, and the cost each purchase carries — read before re-deriving a rule that was deliberately dropped.
- [wiki/server-structure.md](wiki/server-structure.md) — How the state service is built since 2026-11-11 (brief 04) — TypeScript built with tsc, the code-structure layout, TypeBox rather than zod, the error body, shutdown, timeouts and trustProxy; read before adding a route or a plugin.
- [wiki/status.md](wiki/status.md) — Dated snapshot (2026-11-13) of sports-app, per area. The Up first redesign (2026-11-13: new tokens, a top bar from 840 px, the first exercise open on Today, Playwright checks). The fixed schedule (v2, 2026-07-29), the category-standard rebuild with logging and the token system (2026-09-04), the rigged figures (2026-10-02), the in-between rungs (2026-10-07), local accounts with Ward as a second way in (2026-10-13), the docs site on Docusaurus and the sign-in fixes (2026-10-19 to 2026-10-28); 1,252 client and server tests plus the Playwright specs; what is still open and left for the owner; what is deliberately out.
- [wiki/technical-decisions.md](wiki/technical-decisions.md) — Locked stack, storage, routing, timer and rendering choices — read before proposing an alternative implementation.
- [wiki/training-science.md](wiki/training-science.md) — Evidence base for the programme — what the five slots actually train, which muscles get nothing, the isometric and concurrent-training ceilings, and what the fixed schedule costs.

<!-- END CATALOG -->
