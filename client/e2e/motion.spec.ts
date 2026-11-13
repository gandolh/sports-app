import { SCREENS, expect, ready, test } from "./fixtures.ts";

/**
 * Under `prefers-reduced-motion: reduce` the figures and the progress ring do not
 * animate. Without it, the figure does, so the first check is not vacuous.
 */
test.describe("reduced motion", () => {
  test.use({ colorScheme: "light" });

  test("the figure on the player does not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SCREENS.player);
    await ready(page);
    await page.waitForTimeout(600);
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().activeDuration !== 0).length,
    );
    expect(running).toBe(0);
  });

  test("the figure on Today does not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SCREENS.today);
    await ready(page);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("the figure animates when motion is allowed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SCREENS.player);
    await ready(page);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
  });

  test("the progress ring is at its final value at once and stays there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SCREENS.today);
    await ready(page);
    const ring = page.locator('[role="img"][aria-label^="This week"] circle').nth(1);
    const first = await ring.getAttribute("stroke-dashoffset");
    const style = await ring.evaluate((node) => getComputedStyle(node).strokeDashoffset);
    await page.waitForTimeout(500);
    expect(await ring.evaluate((node) => getComputedStyle(node).strokeDashoffset)).toBe(style);
    expect(Number(first)).toBeGreaterThan(0);
    expect(Number.parseFloat(style)).toBeCloseTo(Number(first), 1);
  });
});
