// @vitest-environment jsdom
//
// The Light / Dark / System switch: what a first visit shows, what the blocking script in
// `index.html` stamps, and that the browser-bar colour it sets is the page colour `tokens.css` has.
import { beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../../index.html?raw";
import tokens from "../tokens.css?raw";
import { readTheme, setTheme } from "../components/theme.ts";

function stubDarkOs(dark: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Run the page's own blocking script against the current document, as the browser would. */
function runBootScript(): void {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1];
  if (script === undefined) throw new Error("index.html has no blocking script");
  new Function(script)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
  vi.unstubAllGlobals();
});

describe("the first visit", () => {
  it("reads as light when nothing is stored", () => {
    expect(readTheme()).toBe("light");
  });

  it("stamps light on a dark OS, because System is a choice and not the default", () => {
    stubDarkOs(true);
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#ffffff");
  });
});

describe("a stored choice", () => {
  it.each(["light", "dark", "system"] as const)("%s survives a reload", (choice) => {
    setTheme(choice);
    expect(localStorage.getItem("sports-app.theme")).toBe(choice);
    expect(readTheme()).toBe(choice);
    document.documentElement.removeAttribute("data-theme");
    stubDarkOs(false);
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe(choice);
  });

  it("makes the browser bar dark for Dark, and for System on a dark OS only", () => {
    const bar = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");
    localStorage.setItem("sports-app.theme", "dark");
    stubDarkOs(false);
    runBootScript();
    expect(bar()).toBe("#0a0d11");

    document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
    localStorage.setItem("sports-app.theme", "system");
    runBootScript();
    expect(bar()).toBe("#ffffff");

    stubDarkOs(true);
    runBootScript();
    expect(bar()).toBe("#0a0d11");
  });
});

describe("the browser-bar colours are the page colours", () => {
  // `<meta>` can't read a custom property, so the two hex values in index.html are copies of `--bg`.
  it("matches --bg in tokens.css, light and dark", () => {
    const light = /^:root\s*\{[^}]*?--bg:\s*(#[0-9a-f]{6})/m.exec(tokens)?.[1];
    const dark = /:root\[data-theme="dark"\]\s*\{[^}]*?--bg:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1];
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(indexHtml).toContain(`<meta name="theme-color" content="${light}" />`);
    expect(indexHtml).toContain(`setAttribute("content", "${dark}")`);
  });
});
