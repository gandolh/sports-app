---
summary: The two product decisions the Up first redesign (approved 2026-11-13) changed, each with the old line kept: the places on a top bar from 840 px with a gradient ring in one hue and solid buttons, and no tracked capitals.
updated: 2026-11-13
---

# Decisions changed by the redesign (2026-11-13)

The owner approved the redesign direction "Up first" on the estate redesign board, with every question on the board
standing as proposed ([log](../log.md), 2026-11-13). Both changes are recorded in [decisions.md](decisions.md) and
[design-system.md](design-system.md) in one line each; this page holds the old and the new.

## The visual direction is still the category standard; the places and the ring moved

- **Was (2026-09-04):** "Dark ground, gradient progress ring, streak grid, stat tiles, bottom tab bar, Inter
  throughout — executed straight, at full fidelity."
- **Is:** dark ground, a gradient progress ring, streak grid, stat tiles, Inter throughout, and the four places as a
  bottom tab bar on phones and a 64 px top bar from 840 px wide (the places on the left, the date and the streak on the
  right). The ring is still a gradient, within the accent's own hue: `--accent-2` is the far end of that hue, no
  longer violet. Start workout and Next set are solid `--accent`, not a gradient.
- **Why:** convention is still the commitment. What moved is the shape of a desktop screen and the first screen of
  Today (the first exercise open, then the rest of the session in one list).

## No tracked capitals

- **Was (`design-system.md`):** "Only `--fs-label` is uppercase", with `--ls-label` at 0.10em.
- **Is:** labels, units and the ring caption are sentence case at 13/16, weight 600, untracked. There is no
  `uppercase` in the components and no `--ls-label` token.
