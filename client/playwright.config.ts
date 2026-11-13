import { defineConfig } from "@playwright/test";

/**
 * The browser tests: headless Chromium against the Vite dev server, with the
 * state service never reached. Every request to `/api` is answered by the
 * fixture (`e2e/fixtures.ts`), service workers are blocked, and the training
 * history is a generated one written into local storage before the page loads,
 * with the clock frozen at 12 November 2026, 10:00 in Bucharest.
 *
 * Start the server from `client/`, on a free port, and not through `npm run
 * dev`: that script loads the repo's `.env` and proxies `/api` to the real
 * service.
 *
 *   node ../node_modules/vite/bin/vite.js --port 5188 --strictPort
 *   PORT=5188 npx playwright test --workers=2
 *
 * `SHOTS_DIR=<folder> PORT=5188 npx playwright test shots` also writes the
 * screen captures (never in git). Three projects, one per theme choice: light
 * (the first visit), dark, and system (which follows the browser's colour
 * scheme, dark here).
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const PORT = Number(process.env["PORT"] ?? 5188);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: "en-GB",
    timezoneId: "Europe/Bucharest",
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "light", use: { colorScheme: "light" }, metadata: { theme: "light" } },
    { name: "dark", use: { colorScheme: "dark" }, metadata: { theme: "dark" } },
    { name: "system", use: { colorScheme: "dark" }, metadata: { theme: "system" } },
  ],
});
