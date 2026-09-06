# Third-party notices

sports-app is licensed under the **GNU AGPL v3.0** (see [LICENSE](LICENSE)).

**It was not always.** The project carried no licence until 2026-09-06, when the
exercise reference library was imported from openGym. That import is the reason
for the licence, and the reason is worth stating plainly rather than leaving a
future reader to infer it from a file that appeared one day.

## Exercise reference library

`client/src/domain/library.ts` is derived from
[**openGym**](https://github.com/arvids-unavailable/openGym) — Copyright (C) 2026
Duarte Santos — specifically `frontend/src/lib/exercises-data.js`, used under the
**GNU AGPL v3.0**.

**AGPL v3.0 is a strong copyleft with a network clause (§13).** Because sports-app
is served over a network, anyone who can reach a deployment is entitled to its
corresponding source. That obligation now attaches to this whole repository, which
is why the licence above applies to code that has nothing to do with the import.
This was accepted deliberately.

### What was changed on import

- **Filtered to bodyweight.** 325 of openGym's 1,324 entries carry
  `equipment: "body weight"`; the other 999 need barbells, dumbbells, cables,
  bands or machines. Zero equipment is a hard constraint here, reaffirmed three
  times (`corpus/wiki/decisions.md`), and it was **not** among the decisions
  reversed on 2026-09-04. Importing equipment exercises would have contradicted a
  live invariant, so they were left behind.
- **Image and animation references were dropped.** The upstream records carry
  `img` and `gif` filenames, but openGym's repository does not contain those
  files — `assets/` holds a banner and screenshots. Keeping the fields would have
  shipped references that resolve to nothing. **No binary assets were copied.**
  This app's own figures remain the hand-authored SVG rigs in
  `client/src/ui/figures/`.
- Field names were expanded from openGym's abbreviations (`n`, `bp`, `eq`, `tg`,
  `mg`, `sm`, `st`) to readable ones, and the result is emitted as typed
  TypeScript rather than JavaScript.

### Unresolved upstream provenance — read before relying on this

**openGym does not say where its exercise data came from.** Its `NOTICE.md`
attributes body-map geometry to [MuscleMap](https://github.com/melihcolpan/MuscleMap)
(MIT) and nothing else.

The records are shaped like **ExerciseDB** — sequential string ids (`"0001"`) and
asset names of the form `0001-2gPfomN.gif` are that dataset's signature — and
ExerciseDB is distributed commercially through RapidAPI rather than under an open
licence. **We therefore cannot establish a clean chain of title for this content.**
openGym's AGPL grant covers openGym's own work; it cannot grant rights in data
openGym does not own.

This is recorded rather than resolved. If the provenance matters for your use,
the clean substitute is
[**free-exercise-db**](https://github.com/yuhonas/free-exercise-db) — 876
exercises, 188 of them bodyweight, released into the **public domain** under the
Unlicense, with images in the repository. Swapping to it would remove both the
AGPL obligation and this uncertainty.

## Body diagram geometry

Not imported. sports-app draws no body maps.
