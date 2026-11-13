import { SCREENS, expect, ready, test } from "./fixtures.ts";
import type { Scenario } from "./fixtures.ts";

/**
 * The screen captures for the comparison with the board's comps. They are
 * written only when `SHOTS_DIR` is set, outside git, named
 * `<screen>-<theme>-<width>.png`.
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const DIR = process.env["SHOTS_DIR"];
const SIZES = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

interface Shot {
  readonly name: string;
  readonly path: string;
  readonly scenario: Scenario;
  readonly extra?: readonly { readonly width: number; readonly height: number }[];
}

const SHOTS: readonly Shot[] = [
  { name: "today", path: SCREENS.today, scenario: "history", extra: [{ width: 360, height: 800 }] },
  { name: "today-push", path: SCREENS.today, scenario: "push" },
  { name: "today-cardio", path: SCREENS.today, scenario: "cardio" },
  { name: "player", path: SCREENS.player, scenario: "history", extra: [{ width: 360, height: 800 }] },
  { name: "player-timed", path: SCREENS["player-timed"], scenario: "history" },
  { name: "finish", path: SCREENS.finish, scenario: "history" },
  { name: "progress", path: SCREENS.progress, scenario: "history" },
  { name: "plan", path: SCREENS.plan, scenario: "history" },
  { name: "library", path: SCREENS.library, scenario: "history" },
  { name: "account", path: SCREENS.account, scenario: "history" },
  { name: "login", path: "/login", scenario: "signed-out" },
  { name: "not-found", path: SCREENS["not-found"], scenario: "history" },
  { name: "guard-legacy", path: SCREENS.today, scenario: "legacy" },
  { name: "guard-unreadable", path: SCREENS.today, scenario: "unreadable" },
];

test.skip(DIR === undefined, "SHOTS_DIR is not set");

for (const shot of SHOTS) {
  test.describe(shot.name, () => {
    test.use({ scenario: shot.scenario });
    for (const size of [...SIZES, ...(shot.extra ?? [])]) {
      test(`${size.width}`, async ({ page }, testInfo) => {
        const theme = (testInfo.project.metadata as { theme: string }).theme;
        test.skip(theme === "system", "light and dark only");
        await page.setViewportSize(size);
        await page.goto(shot.path);
        await ready(page);
        await page.waitForTimeout(1500);
        await expect(page.locator("body")).toBeVisible();
        await page.screenshot({ path: `${DIR}/${shot.name}-${theme}-${size.width}.png` });
      });
    }
  });
}
