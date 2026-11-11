// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    // A warning for now (2026-11-11): client/src/ui/figures/rig.ts imports the MotionTimeline type from
    // motion.ts, which imports rig.ts back, and primitives.tsx closes a second loop. When that type
    // moves to figures/types.ts, this goes and the rule is an error again.
    { name: "no-circular", severity: "warn" },
  ],
};
