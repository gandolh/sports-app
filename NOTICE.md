# Third-party notices

## Exercise reference library

`client/src/domain/library.ts` is derived from
[**free-exercise-db**](https://github.com/yuhonas/free-exercise-db), released into
the **public domain under the Unlicense**.

There is no attribution requirement and no copyleft obligation. It is credited
here anyway: "we did not have to" is a poor reason not to say where something
came from, and the next person to open that file should not have to guess.

### What was changed on import

- **Filtered to bodyweight.** 188 of 876 entries carry `equipment: "body only"`
  or none. Zero equipment is a hard constraint here, reaffirmed three times
  (`corpus/wiki/decisions.md`), and it was **not** among the decisions reversed
  on 2026-09-04.
- **Two entries dropped for having no instructions** — `Side_Bridge` and
  `Side_Jackknife` ship empty. A reference entry that cannot tell you how to do
  the movement is not a reference entry, and an empty disclosure is worse than an
  absent one because the row invites a tap that returns nothing. **186 remain.**
- **Image fields dropped, and no binary copied.** free-exercise-db *does* ship
  its images, so this is a choice rather than a repair. This app's figures are
  the hand-authored SVG rigs in `client/src/ui/figures/`.

`scripts/import-library.mjs` regenerates the module, so every filter above is
readable and re-runnable rather than baked into a paste.

## The openGym import, and why it was replaced

**For one commit — `4d93f47`, on 2026-09-06 — this library was derived from
[openGym](https://github.com/arvids-unavailable/openGym) instead, and this
repository was AGPL v3.0 as a direct result.** It was replaced the same day.

Both reasons are worth keeping, because they are the reasons to prefer this
source over any similarly convenient one in future:

1. **AGPL v3.0 has a network clause.** sports-app is served over a network, so
   §13 would have attached to the whole repository — including code with nothing
   to do with exercises.
2. **openGym does not own that data.** Its `NOTICE.md` attributes
   [MuscleMap](https://github.com/melihcolpan/MuscleMap) (MIT) for body-map
   geometry and is silent on the exercises, which carry ExerciseDB's signature —
   sequential string ids (`"0001"`), assets named `0001-2gPfomN.gif` — and
   ExerciseDB is distributed commercially through RapidAPI. **No chain of title
   could be established**, and an AGPL grant cannot convey rights the grantor
   lacks.

free-exercise-db removes both problems at once, and its `force` / `category` /
`level` fields map onto how this programme is actually organised, which openGym's
body-part strings did not. 186 usable entries against 325 is the trade, and it is
a good one.

### What this does NOT undo

**Deleting the file did not remove it from history.** Commit `4d93f47` still
contains openGym-derived data. That is harmless while this repository stays
unpublished, and the commit is unpushed — but if it is ever distributed, that
commit travels with it and the AGPL question comes back with it.

Two clean ways to close it, both recorded in
[`corpus/wiki/licensing.md`](corpus/wiki/licensing.md): drop the commit from
history before publishing, or keep AGPL v3.0 deliberately. **The licence file is
still present pending that decision** — staying over-restrictive is the safe
direction to wait in.
