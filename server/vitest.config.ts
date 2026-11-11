// The service is TypeScript run directly by Node (type stripping) in development and by the tests, and
// built with `tsc` for the image. It is not bundled and there is no Vite pipeline here, but its tests
// belong to `npm test` all the same, so it gets a Vitest config of its own and the root config lists it
// as a project.
//
// A config *file* rather than an inline project object in the root config, for one
// concrete reason: an inline project's `root` is resolved against the process
// working directory, so `npm test` from the repo root and from a workspace
// directory would collect different files. A directory listed in `projects`
// resolves against the root config's own location and each config's `root` defaults
// to its own directory, which is the same answer from anywhere.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No DOM, ever. Nothing here has a browser to run in.
    environment: "node",
    globals: true,
    include: ["**/*.{test,spec}.ts"],
  },
});
