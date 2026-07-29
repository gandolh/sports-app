# Routing profile — sports-app

Read by the `orchestrate` skill at the start of a work request.

## Skill choices

| Purpose | Skill |
|---|---|
| Implement | `plan-split-dispatch` |
| Capture | `corpus-flow` |
| Query knowledge | `corpus-flow` §5 |
| Design / UI | `impeccable` |
| Research | `web-research` |
| Review | inline (no project reviewer yet — greenfield) |
| Pre-PR | none yet (single-user repo, no MR flow) |

## Intent table

| The user says | Route to |
|---|---|
| "add a todo", "note this for later" | `corpus-flow` §1 |
| "let's build brief NN", "implement this" | `corpus-flow` §3 → `plan-split-dispatch` |
| "what does the wiki say about X" | `corpus-flow` §5 |
| "grill me", "stress-test this design" | `grill-me` |
| "make the player screen feel better" | `impeccable` |
| "is high-rep bodyweight work still strength training?" | `web-research` |
| "does the engine over-advance?" | run the simulation harness (brief 04), not the wiki |

## READ / SKIP / SKILLS

| Always READ | Always SKIP | Load SKILL |
|---|---|---|
| [../SPEC.md](../SPEC.md) | `node_modules/`, `dist/`, `.codegraph/` | `corpus-flow` for any capture or completion |
| [index.md](index.md) | lockfiles | `plan-split-dispatch` for ≥3 independent chunks |
| [wiki/status.md](wiki/status.md) | generated PWA assets | `impeccable` for any visual/UX work |
| [CLAUDE.md](CLAUDE.md) invariants | `briefs/` wholesale | `grill-me` before a large new subsystem |

## Knowledge routing — question shape → layer

| Question shape | Layer | Why |
|---|---|---|
| "Why is it built this way?" | `wiki/` + [../SPEC.md](../SPEC.md) | The corpus is the *why*. |
| "What is the advance rule?" | [wiki/progression-engine.md](wiki/progression-engine.md) | Owns that concept. |
| "Where does feature Y live?" | code graph (not yet installed) → `grep` | Structural. Never ask the wiki. |
| "Who calls X / what breaks if I change X?" | code graph → verify with `grep` | Structural. |
| "Did I get *every* usage?" | `grep -rnw` | Completeness needs exhaustive search. |
| "Does the engine behave correctly?" | the simulation harness + unit tests | Behavior is verified, not remembered. |

**Code graph:** not installed. This is a greenfield single-package app — the graph
earns its keep on large unfamiliar codebases, and here `grep` over a small `src/`
is cheaper than maintaining an index. Revisit if `src/` passes ~50 files.
