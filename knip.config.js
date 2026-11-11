import preset from "./vendor/house-style/knip.json" with { type: "json" };

// knip has no `extends`, so this spreads the house preset and adds what knip can't find on its own.
export default {
  ...preset,
  // docs/ is a Docusaurus workspace: its dependencies are named by its own config strings, and it has
  // its own typecheck and build.
  ignoreWorkspaces: ["docs"],
  workspaces: {
    ".": {
      entry: ["scripts/*.{js,mjs,ts}"],
      // Found unused on 2026-11-11 and left for now: nothing imports it, and a setup file that
      // registers its matchers is not yet written. The decision to use it or drop it comes with the
      // client's test pass.
      ignoreDependencies: ["@testing-library/jest-dom"],
    },
    server: {
      // A warning for now (2026-11-11): state-server.mjs imports Typebox's compiler, which arrives
      // through Fastify and is not declared. When the server moves to TypeScript and declares what it
      // imports, this goes.
      ignoreDependencies: ["@sinclair/typebox"],
    },
  },
};
