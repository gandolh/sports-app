// `defineConfig` comes from vitest/config, not vite — that is what types the
// `test` block below. Importing it from 'vite' typechecks everything except the
// test config, which then silently does nothing.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * This repo deliberately carries no `@types/node` — `client/tsconfig.json` pins
 * `types` to the three it actually wants, and the service is untypechecked
 * `.mjs`. One env var does not justify reversing that, so this declares the
 * single member of `process` used below and nothing else.
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/**
 * Where the app is served from, with a guaranteed leading and trailing slash.
 *
 * Defaults to `/` so local dev, `npm run preview` and every test are unchanged;
 * the VPS deploy sets `SPORTS_APP_BASE=/sports-app/` because the box serves a
 * dozen projects as sub-paths of one domain. It has to be a build-time constant
 * rather than runtime config: Vite bakes it into every asset URL, and the PWA
 * manifest and service-worker scope below have to agree with it exactly or the
 * installed app resolves its own start URL outside its own scope.
 */
const baseSegment = (process.env.SPORTS_APP_BASE ?? '').replace(/^\/+|\/+$/g, '')
const base = baseSegment === '' ? '/' : `/${baseSegment}/`

export default defineConfig({
  base,
  plugins: [
    react(),
    // Tailwind v4, as a Vite plugin rather than through PostCSS. The difference
    // is not ergonomic: the plugin reads `@theme` out of `src/ui/tokens.css`
    // itself, which is what lets that file stay the single source of colour
    // truth. There is deliberately no `tailwind.config.js` — a JS config holding
    // the palette would put the colours somewhere `__tests__/noHexColors.test.ts`
    // and `__tests__/contrast.test.ts` cannot parse, and both work by reading
    // exactly one CSS file.
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        // All three follow `base`. `scope` is what stops an installed PWA at
        // /sports-app/ from claiming the whole domain on a shared host.
        id: base,
        start_url: base,
        scope: base,
        name: 'Calisthenics',
        short_name: 'Calisthenics',
        description: 'Zero-equipment calisthenics trainer',
        // Matches light `--bg` in tokens.css. These two are the splash and the OS
        // chrome, so a mismatch here shows up as a coloured flash between the
        // splash and the first paint — the one place the theme is visible
        // before any of the app's own CSS has loaded.
        //
        // A manifest has one pair of these and the app now has two themes, so one
        // of them will flash. Light is the value that stays because it is the
        // unstamped default in `tokens.css`; making the flash follow the user's
        // choice needs a `<meta name="theme-color" media="…">` pair in
        // `index.html`, which is brief 27's file.
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole shell. The app must be fully usable with no
        // network — nothing on the session-critical path may require it.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        // Client-side routing: a cold load of /sports-app/week must serve the
        // shell, not 404. Caddy's `try_files` does this when online; this is the
        // same rule for when the service worker is answering instead, which is
        // the case that actually matters here.
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  // Dev only. The state service (brief 11) binds 127.0.0.1 and the app talks to
  // it on the same origin through this proxy, so there is no CORS preflight to
  // configure and `settings.sync.baseUrl` can be left empty in development.
  // The port matches `DEFAULT_PORT` in ../server/state-server.mjs; if you override
  // SPORTS_APP_PORT, override this too. Splitting the repo into workspaces changed
  // nothing here — the proxy target is a port on the loopback interface, not a
  // path, so the service being a sibling package rather than a sibling directory
  // is invisible to it.
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  test: {
    // `node` by default so src/domain/ tests run with no DOM at all. Component
    // tests opt in per-file with `// @vitest-environment jsdom`.
    environment: 'node',
    // Not for styling — no test renders anything that needs a stylesheet. It is
    // what makes a CSS file readable *as text* from `import.meta.glob(…, '?raw')`.
    //
    // With the default `css: false`, Vitest stubs every CSS module to an empty
    // string, and it does so by module id, so `tokens.css?raw` is stubbed too.
    // The glob still returns the right *keys*, which is the trap: a test that
    // greps CSS source passes with flying colours while reading nothing at all.
    // `__tests__/noHexColors.test.ts` had been checking `app.css` that way since
    // it was written, and `__tests__/contrast.test.ts` needs the token values,
    // so this flips both from vacuous to real.
    css: true,
    globals: true,
    // Client tests only. The service's tests are a separate Vitest project
    // (server/vitest.config.mjs) that the root config aggregates, so `npm test`
    // at the root still reports one total across both.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
