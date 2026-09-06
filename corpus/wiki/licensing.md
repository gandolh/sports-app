---
summary: Why the repository is AGPL v3.0, what the exercise reference cost to import, the unresolved chain of title behind it, and the public-domain substitute that would undo both.
updated: 2026-09-06
---

# Licensing

Split out of [decisions.md](decisions.md) on 2026-09-06, the day it was written —
a legal position is not a product decision, and this one will grow if the source
is ever swapped. [`../../NOTICE.md`](../../NOTICE.md) is the shipped attribution;
this page is the reasoning. [`../log.md`](../log.md) has the trail, including the
objections that were raised and then reaffirmed.

## The reference is public domain, and the AGPL is now optional

*Swapped 2026-09-06, one commit after the openGym import landed.*

`client/src/domain/library.ts` is derived from **free-exercise-db**, released into
the public domain under the **Unlicense**. No attribution requirement, no
copyleft, no chain-of-title question. 186 bodyweight entries after two are dropped
for shipping no instructions.

It is also the better dataset for this app despite being smaller than openGym's
325: its `force` (push / pull / static), `category` and `level` fields map onto
the axes the five ladders are built on, where openGym gave a body-part string
that mapped onto nothing here.

### The licence is gone from the tree; the history is a separate question

**`LICENSE` and the `license` field were removed on 2026-09-06.** The current tree
contains no openGym-derived material, so it needs no AGPL, and the project is back
to where it was: **no licence, all rights reserved.**

**What that does not settle.** `4d93f47` carried the openGym data and **was pushed to the
project's public GitHub remote**, before it was replaced. It
was distributed. Three things follow, and none of them are undone by deleting a
file:

- The AGPL attached to *that distributed version*. Whoever obtained it has AGPL
  rights **to that version**. That is not retroactively removable.
- Purging the commit would stop *further* distribution, not past distribution.
- **Purging it now means force-pushing a public repository.** Clones and forks
  keep the commit, and GitHub serves orphaned commits by SHA long after the
  branch stops pointing at them.

The original plan recorded here — "rewrite the one unpushed commit" — **was
written on a false premise.** The work was already pushed; the controller checked
`git status` (which reported the upstream as gone) rather than `git ls-remote`,
and stated it was unpushed. Corrected the same day. The generalisable version:
**a tracking ref is not the remote, and "unpushed" is a claim to verify, not
infer** — especially before offering a history rewrite as cheap.

Whether to purge anyway is open, and it is a judgement about tidiness and
provenance rather than about obligation:

| | For | Against |
|---|---|---|
| **Purge** | The repo stops carrying data whose chain of title was never established | Force-push on a public repo; forks and clones keep it; orphans remain reachable by SHA |
| **Leave** | Honest history; nothing further is distributed once the tip no longer contains it | A commit containing unattributed third-party data stays reachable |

## SUPERSEDED — The repository is AGPL v3.0, and the exercise reference is why

*Decided 2026-09-06. Full position in [`../../NOTICE.md`](../../NOTICE.md); the
reasoning trail, including the objections raised and reaffirmed, is in
[`../log.md`](../log.md).*

`client/src/domain/library.ts` is 325 bodyweight exercises derived from **openGym**
(AGPL v3.0). Importing it relicensed **the whole repository**, because AGPL §13
attaches to anything served over a network and this app is.

Three things a future reader must not have to rediscover:

1. **openGym does not own the data.** It attributes MuscleMap for body geometry
   and is silent on the exercises, which carry ExerciseDB's signature. There is
   **no clean chain of title**, and an AGPL grant cannot convey rights the grantor
   lacks. This is recorded, not resolved.
2. **The clean substitute exists.** free-exercise-db — 876 exercises, 188
   bodyweight, public domain, images in-repo — would remove both the obligation
   and the uncertainty if this is revisited.
3. **Zero equipment still holds.** 999 of openGym's 1,324 entries need equipment
   and were left behind. That constraint was *not* among the 2026-09-04
   reversals.

**The reference is not the programme.** Nothing in it is prescribed, it is reached
from `/account` rather than the tab bar, and `library.test.ts` asserts by import
graph that no file in `domain/` imports it — so it cannot become an input to
`prescribe()` without failing a test first.
