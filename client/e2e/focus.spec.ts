import { SCREENS, expect, ready, test } from "./fixtures.ts";
import type { Scenario } from "./fixtures.ts";

/**
 * Tabbing through each screen puts a visible ring on every stop, and the ring
 * has at least 3:1 against what is painted behind it.
 */
interface Stop {
  readonly label: string;
  readonly style: string;
  readonly width: number;
  readonly ratio: number;
}

const FOCUS_SCREENS: readonly (readonly [string, string, Scenario])[] = [
  ["today", SCREENS.today, "history"],
  ["player", SCREENS.player, "history"],
  ["player timed", SCREENS["player-timed"], "history"],
  ["progress", SCREENS.progress, "history"],
  ["plan", SCREENS.plan, "history"],
  ["library", SCREENS.library, "history"],
  ["account", SCREENS.account, "history"],
  ["login", "/login", "signed-out"],
  ["guard: history on this browser", SCREENS.today, "legacy"],
  ["guard: unreadable history", SCREENS.today, "unreadable"],
  ["not found", SCREENS["not-found"], "history"],
];

for (const [name, path, scenario] of FOCUS_SCREENS) {
  test.describe(name, () => {
    test.use({ scenario });

    for (const size of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      test(`${size.width}px: a ring of at least 3:1 on every stop`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(path);
        await ready(page);
        const stops: Stop[] = [];
        for (let press = 0; press < 80; press += 1) {
          await page.keyboard.press("Tab");
          const stop = await page.evaluate((): Stop | null => {
            const element = document.activeElement;
            if (element === null || element === document.body) return null;
            const parse = (value: string): [number, number, number, number] => {
              const found = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)/.exec(value);
              if (found === null) return [0, 0, 0, 0];
              return [
                Number(found[1]),
                Number(found[2]),
                Number(found[3]),
                found[4] === undefined ? 1 : Number(found[4]),
              ];
            };
            const luminance = ([r, g, b]: readonly number[]): number => {
              const channel = (c: number): number => {
                const s = c / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              };
              return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
            };
            let ground: [number, number, number, number] = [255, 255, 255, 1];
            for (let node: Element | null = element.parentElement; node !== null; node = node.parentElement) {
              const painted = parse(getComputedStyle(node).backgroundColor);
              if (painted[3] > 0.98) {
                ground = painted;
                break;
              }
            }
            const style = getComputedStyle(element);
            const ring = parse(style.outlineColor);
            const [a, b] = [luminance(ring), luminance(ground)].sort((x, y) => y - x);
            return {
              label: (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName).trim().slice(0, 40),
              style: style.outlineStyle,
              width: Number.parseFloat(style.outlineWidth),
              ratio: ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05),
            };
          });
          if (stop === null) break;
          stops.push(stop);
        }
        expect(stops.length, "the screen has something to tab to").toBeGreaterThan(0);
        for (const stop of stops) {
          expect(stop.style, `${stop.label}: a ring is drawn`).not.toBe("none");
          expect(stop.width, `${stop.label}: ring width`).toBeGreaterThanOrEqual(2);
          expect(stop.ratio, `${stop.label}: ring contrast ${stop.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });
}
