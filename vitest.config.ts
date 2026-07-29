// The one place `npm test` starts, and the only reason it exists is that a single
// number is a better signal than two: the client and the service are separate
// Vitest projects with different configs, and this aggregates them into one run
// with one total. Brief 21 is a move, so "all 611 still pass" is the whole
// acceptance criterion — and it is not a criterion you can check by adding up two
// summaries by eye.
//
// `defineConfig` comes from `vitest/config` for the same reason it does in
// `client/vite.config.ts`: it is what types the `test` block.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Each entry is a *directory*, so each project's config is found inside it and
    // its `root` defaults to its own location. That makes the collection identical
    // whether `npm test` runs here or in a workspace — an inline project object
    // would resolve `root` against the process working directory instead.
    //
    //   client → client/vite.config.ts   (React plugin, PWA, jsdom opt-in per file)
    //   server → server/vitest.config.mjs (plain Node, no transform pipeline)
    //
    // `shared/` has no project of its own. Its own tests would have nowhere to
    // stand: it is types plus one regex, and every behaviour that depends on it is
    // already covered from the side that consumes it — the codec's suite for the
    // client, `state-server.test.mjs` for the service. A third project collecting
    // zero files would be a config entry pretending to be coverage.
    projects: ['client', 'server'],
  },
})
