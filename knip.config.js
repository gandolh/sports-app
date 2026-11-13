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
    // The browser tests: Playwright finds its config and the specs by name, so nothing imports them.
    client: {
      entry: ["playwright.config.ts", "e2e/*.ts"],
    },
  },
};
