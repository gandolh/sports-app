import { SCREENS, expect, ready, test } from "./fixtures.ts";

/**
 * The whole session on the first screen. Each exercise row has to end above the
 * action band (the main region's own bottom edge, which is the footer's top on a
 * phone and the window's on a desktop) at 1280x800, 390x844 and 360x800, and the
 * numbers are reported with the test. On the player at 360 the whole stop rule has
 * to end above the actions. A name wraps to two lines at most.
 */
const SIZES = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

test.describe("Today", () => {
  for (const size of SIZES) {
    test(`${size.width}x${size.height}: every exercise is above the fold`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      await page.goto(SCREENS.today);
      await ready(page);
      const measured = await page.evaluate(() => {
        const bottom = document.querySelector("main")?.getBoundingClientRect().bottom ?? 0;
        const up = document.querySelector("article")?.getBoundingClientRect().bottom ?? 0;
        const rows = [...document.querySelectorAll("section[aria-labelledby='then'] summary")].map((row) => ({
          bottom: row.getBoundingClientRect().bottom,
          lines: Math.round(
            (row.querySelector("span.min-w-0 > span")?.getBoundingClientRect().height ?? 0) /
              Number.parseFloat(getComputedStyle(row.querySelector("span.min-w-0 > span") ?? row).lineHeight),
          ),
        }));
        return { bottom, up, rows };
      });
      const last = measured.rows.at(-1)?.bottom ?? 0;
      testInfo.annotations.push({
        type: "first screen",
        description: `fold ${measured.bottom}, up first ends ${measured.up}, rows end ${measured.rows.map((r) => Math.round(r.bottom)).join("/")}`,
      });
      console.log(`today ${size.width}x${size.height}: ${testInfo.annotations.at(-1)?.description}`);
      expect(measured.rows).toHaveLength(3);
      expect(measured.up).toBeLessThanOrEqual(measured.bottom);
      expect(last).toBeLessThanOrEqual(measured.bottom);
      for (const row of measured.rows) expect(row.lines).toBeLessThanOrEqual(2);
    });
  }
});

test.describe("the player", () => {
  test("360x800: the whole stop rule ends above the actions", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(SCREENS.player);
    await ready(page);
    const measured = await page.evaluate(() => {
      const rule = document.querySelector("[data-testid='stop-rule']")?.getBoundingClientRect();
      const bottom = document.querySelector("main")?.getBoundingClientRect().bottom ?? 0;
      return { ruleBottom: rule?.bottom ?? 0, bottom };
    });
    console.log(`player 360x800: stop rule ends ${measured.ruleBottom}, actions start ${measured.bottom}`);
    testInfo.annotations.push({ type: "stop rule", description: `${measured.ruleBottom} / ${measured.bottom}` });
    expect(measured.ruleBottom).toBeLessThanOrEqual(measured.bottom);
  });
});
