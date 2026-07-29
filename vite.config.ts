// `defineConfig` comes from vitest/config, not vite — that is what types the
// `test` block below. Importing it from 'vite' typechecks everything except the
// test config, which then silently does nothing.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Calisthenics',
        short_name: 'Calisthenics',
        description: 'Zero-equipment calisthenics trainer',
        // Deliberately dark: this app is opened at 7am on a floor, and a
        // full-white splash in a dim room is genuinely unpleasant.
        theme_color: '#111418',
        background_color: '#111418',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
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
      },
    }),
  ],
  // Dev only. The state service (brief 11) binds 127.0.0.1 and the app talks to
  // it on the same origin through this proxy, so there is no CORS preflight to
  // configure and `settings.sync.baseUrl` can be left empty in development.
  // The port matches `DEFAULT_PORT` in server/state-server.mjs; if you override
  // SPORTS_APP_PORT, override this too.
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  test: {
    // `node` by default so src/domain/ tests run with no DOM at all. Component
    // tests opt in per-file with `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    // `server/` is plain .mjs run under Node — it is the zero-dependency state
    // service, not part of the bundle — but its tests belong to `npm test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.mjs'],
  },
})
