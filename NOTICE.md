# Third-party notices

## Exercise reference library

`client/src/domain/library.ts` is derived from
[**free-exercise-db**](https://github.com/yuhonas/free-exercise-db), released into
the **public domain under the Unlicense**.

There is no attribution requirement and no copyleft obligation. It is credited
here anyway: "we did not have to" is a poor reason not to say where something came
from, and the next person to open that file should not have to guess.

### What was changed on import

- **Filtered to bodyweight.** 188 of 876 entries carry `equipment: "body only"` or
  none. Zero equipment is a hard constraint here, reaffirmed three times
  (`corpus/wiki/decisions.md`).
- **Two entries dropped for having no instructions** — `Side_Bridge` and
  `Side_Jackknife` ship empty. A reference entry that cannot tell you how to do
  the movement is not a reference entry, and an empty disclosure is worse than an
  absent one because the row invites a tap that returns nothing. **186 remain.**
- **Image fields dropped, and no binary copied.** free-exercise-db *does* ship its
  images, so this is a choice rather than a repair. This app's figures are the
  hand-authored SVG rigs in `client/src/ui/figures/`.

`scripts/import-library.mjs` regenerates the module, so every filter above is
readable and re-runnable rather than baked into a paste.

## Why not openGym

[openGym](https://github.com/arvids-unavailable/openGym) is the obvious source for
this kind of data and was briefly used. It was replaced for two reasons, both of
which apply to any similarly convenient source and are the reason this file exists:

1. **It is AGPL v3.0, with a network clause.** This app is served over a network,
   so §13 would attach to the entire repository — including code with nothing to
   do with exercises.
2. **It does not own the data.** Its `NOTICE.md` attributes
   [MuscleMap](https://github.com/melihcolpan/MuscleMap) (MIT) for body-map
   geometry and is silent on the exercises, which carry ExerciseDB's signature —
   sequential ids (`"0001"`), assets named `0001-2gPfomN.gif` — and ExerciseDB is
   distributed commercially. **No chain of title could be established**, and an
   AGPL grant cannot convey rights the grantor lacks.

free-exercise-db removes both problems, and its `force` / `category` / `level`
fields map onto how this programme is organised, which openGym's body-part strings
did not.

## Licence

This project carries **no licence** — all rights reserved. It was AGPL v3.0 for
part of one day, solely because of the openGym import; the licence went when the
data did.

**The history is a separate question from the working tree.** See
[`corpus/wiki/licensing.md`](corpus/wiki/licensing.md) — the commit that carried
the openGym data was pushed to a public repository before it was replaced, and
what that does and does not oblige is recorded there rather than assumed.
