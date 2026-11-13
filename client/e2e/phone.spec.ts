import { SCREENS, expect, ready, test } from "./fixtures.ts";
import type { Scenario } from "./fixtures.ts";

/**
 * No horizontal scroll on a phone, on any screen. The page's own width is not
 * enough on its own, because the shell clips its overflow: nothing inside may
 * reach past the viewport either, and `main` may not scroll sideways.
 */
const PHONE_SCREENS: readonly (readonly [string, string, Scenario])[] = [
  ["today", SCREENS.today, "history"],
  ["today, push day", SCREENS.today, "push"],
  ["today, cardio day", SCREENS.today, "cardio"],
  ["player", SCREENS.player, "history"],
  ["player timed", SCREENS["player-timed"], "history"],
  ["finish", SCREENS.finish, "history"],
  ["progress", SCREENS.progress, "history"],
  ["plan", SCREENS.plan, "history"],
  ["library", SCREENS.library, "history"],
  ["account", SCREENS.account, "history"],
  ["login", "/login", "signed-out"],
  ["not found", SCREENS["not-found"], "history"],
  ["guard: history on this browser", SCREENS.today, "legacy"],
  ["guard: unreadable history", SCREENS.today, "unreadable"],
];

for (const [name, path, scenario] of PHONE_SCREENS) {
  test.describe(name, () => {
    test.use({ scenario });
    for (const size of [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      test(`${size.width}px: nothing reaches past the screen`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(path);
        await ready(page);
        const result = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const wide: string[] = [];
          for (const element of document.body.querySelectorAll("*")) {
            const box = element.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (box.right > width + 0.5 || box.left < -0.5) {
              if (element.closest(".sr-only") !== null) continue;
              wide.push(`${element.tagName.toLowerCase()}.${String(element.getAttribute("class")).slice(0, 50)}`);
            }
          }
          const main = document.querySelector("main");
          return {
            page: document.documentElement.scrollWidth,
            width,
            mainOverflow: main === null ? 0 : main.scrollWidth - main.clientWidth,
            wide: wide.slice(0, 5),
          };
        });
        expect(result.page).toBeLessThanOrEqual(size.width);
        expect(result.mainOverflow).toBeLessThanOrEqual(0);
        expect(result.wide).toEqual([]);
      });
    }
  });
}
