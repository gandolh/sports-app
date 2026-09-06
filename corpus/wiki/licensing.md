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

### The AGPL is no longer required — and is not yet removed

**LICENSE (AGPL v3.0) is still in the tree, deliberately.** It was added because
of the openGym import, that import is gone, and the obligation with it — but
**deleting the file did not remove commit `4d93f47` from history**, and that
commit contains openGym-derived data.

While the repository stays unpublished and unpushed this is moot. It stops being
moot the moment it is distributed. Two clean closures, and this is the user's
call because it is the user's copyright:

| Option | What it takes | What it leaves |
|---|---|---|
| **Drop the licence** | Rewrite the one unpushed commit out of history, then delete `LICENSE` and the `license` field | The repository as it was: unlicensed, all rights reserved |
| **Keep AGPL v3.0** | Nothing | A copyleft licence chosen on purpose rather than inherited by accident |

Staying over-restrictive is the safe direction to wait in, which is why nothing
was removed pre-emptively.

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
