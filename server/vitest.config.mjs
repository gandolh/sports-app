// The service is plain `.mjs` run directly by Node — it is not bundled and there
// is no Vite pipeline here — but its tests belong to `npm test` all the same, so
// it gets a Vitest config of its own and the root config lists it as a project.
//
// A config *file* rather than an inline project object in the root config, for one
// concrete reason: an inline project's `root` is resolved against the process
// working directory, so `npm test` from the repo root and from a workspace
// directory would collect different files. A directory listed in `projects`
// resolves against the root config's own location and each config's `root` defaults
// to its own directory, which is the same answer from anywhere.
//
// `.mjs` and not `.ts`: `server/` is deliberately outside every `tsconfig.json`
// (it is typechecked by JSDoc in an editor, never by `tsc`), and a `.ts` config
// file here would be the only TypeScript in the workspace and the only file `tsc`
// was silently not checking.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // No DOM, ever. Nothing here has a browser to run in.
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.mjs'],
  },
})
