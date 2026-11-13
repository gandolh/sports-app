import { SCREENS, expect, ready, test } from "./fixtures.ts";

/**
 * Light, Dark and System, on the account screen: the choice stamps the page and
 * changes what it paints, and System follows the browser's colour scheme.
 */
test.describe("the theme switch", () => {
  test.use({ colorScheme: "dark" });

  async function bg(page: import("@playwright/test").Page): Promise<string> {
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }

  test("Light, Dark and System each stamp the page and paint it", async ({ page }) => {
    await page.goto(SCREENS.account);
    await ready(page);
    const group = page.getByRole("radiogroup", { name: "Theme" });

    await group.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const light = await bg(page);

    await group.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const dark = await bg(page);
    expect(dark).not.toBe(light);

    await group.getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(await bg(page)).toBe(dark);

    await page.emulateMedia({ colorScheme: "light" });
    expect(await bg(page)).toBe(light);
  });
});
