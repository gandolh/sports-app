import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { StateDoc } from "@sports-app/shared/types.ts";
import { prescribe, recordSession, toSessionResult } from "../src/domain/schedule.ts";
import { emptyDoc, serialise } from "../src/persistence/codec.ts";
import { SESSION_KEY } from "../src/persistence/session.ts";
import { STORAGE_KEYS } from "../src/persistence/store.ts";

/**
 * The browser tests' world: Thursday 12 November 2026, 10:00 in Bucharest, and a
 * generated history of 16 sessions between 7 October and 11 November (Mondays,
 * Wednesdays and Fridays, the first week starting on its Wednesday). With the
 * rotation at 16 sessions, today is a Legs day, session 17.
 *
 * Nothing here is anybody's real data. The state service is never reached: every
 * `/api` request is answered here, and the first screen is built from local
 * storage alone.
 */
export const NOW = "2026-11-12T10:00:00+02:00";
export const USERNAME = "fixture";

/** The days trained, as `YYYY-MM-DD`: 16 of them. */
const TRAINED_DAYS: readonly string[] = [
  "2026-10-07",
  "2026-10-09",
  "2026-10-12",
  "2026-10-14",
  "2026-10-16",
  "2026-10-19",
  "2026-10-21",
  "2026-10-23",
  "2026-10-26",
  "2026-10-28",
  "2026-10-30",
  "2026-11-02",
  "2026-11-04",
  "2026-11-06",
  "2026-11-09",
  "2026-11-11",
];

function historyDoc(days: readonly string[]): StateDoc {
  let doc = emptyDoc(USERNAME);
  for (const day of days) {
    doc = recordSession(doc, toSessionResult(prescribe(doc, "medium"), `${day}T08:00:00.000Z`));
  }
  return doc;
}

/** What the page starts with. */
export type Scenario =
  /** The 16-session history: a Legs day, session 17. */
  | "history"
  /** 15 sessions: a Push day. */
  | "push"
  /** 17 sessions, the last one this morning: a Cardio day. */
  | "cardio"
  /** Signed in with nothing recorded yet. */
  | "empty"
  /** A pre-accounts history on this browser, not yet adopted. */
  | "legacy"
  /** A stored document that cannot be read. */
  | "unreadable"
  /** Nobody signed in. */
  | "signed-out";

interface Options {
  readonly scenario: Scenario;
}

function storageFor(scenario: Scenario): Readonly<Record<string, string>> {
  const live = STORAGE_KEYS.live(USERNAME);
  const session = { [SESSION_KEY]: USERNAME };
  switch (scenario) {
    case "history":
      return { ...session, [live]: serialise(historyDoc(TRAINED_DAYS)) };
    case "push":
      return { ...session, [live]: serialise(historyDoc(TRAINED_DAYS.slice(0, 15))) };
    case "cardio":
      return { ...session, [live]: serialise(historyDoc([...TRAINED_DAYS, "2026-11-12"])) };
    case "empty":
      return { ...session, [live]: serialise(emptyDoc(USERNAME)) };
    case "legacy":
      return { ...session, "sports-app.state.v1": serialise(historyDoc(TRAINED_DAYS.slice(0, 6))) };
    case "unreadable":
      return { ...session, [live]: '{"schemaVersion": 5, "username": "fixture", "history": [' };
    case "signed-out":
      return {};
  }
}

export const test = base.extend<Options & { readonly world: undefined }>({
  scenario: ["history", { option: true }],
  world: [
    async ({ page, scenario }, use, testInfo) => {
      const theme = (testInfo.project.metadata as { theme?: string }).theme ?? "light";
      const entries = storageFor(scenario);
      await page.clock.setFixedTime(new Date(NOW));
      await page.route("**/api/**", (route) => route.fulfill({ status: 503, body: "" }));
      await page.addInitScript(
        ([stored, chosen]) => {
          if (window.localStorage.getItem("fixture.seeded") !== null) return;
          window.localStorage.setItem("fixture.seeded", "1");
          window.localStorage.setItem("sports-app.theme", chosen);
          for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, value);
        },
        [entries, theme] as const,
      );
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };

/** The screens the app has, as the address that reaches them. */
export const SCREENS = {
  today: "/",
  player: "/?v=medium&i=0&d=0",
  "player-timed": "/?v=medium&i=2&d=0",
  finish: "/?v=medium&done=1",
  plan: "/plan",
  progress: "/progress",
  library: "/library",
  account: "/account",
  "not-found": "/there-is-nothing-here",
} as const;

/** Waits for the app to have drawn something real. */
export async function ready(page: Page): Promise<void> {
  await page.waitForSelector("h1, h2");
  await page.evaluate(() => document.fonts.ready);
}
