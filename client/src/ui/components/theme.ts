/**
 * The two stamps on `document.documentElement`, and the only code allowed to
 * write them.
 *
 * ── Attributes, never inline styles ─────────────────────────────────────────
 *
 * This is the single most important line in the file, because getting it wrong
 * looks like it works. `tokens.css` defines the palette three times — bare
 * `:root` for light, a `prefers-color-scheme` block, and a `[data-theme="dark"]`
 * block — and an inline `--accent` on the root element outranks all three at
 * once. The reference build does exactly that, and the result is its light mode
 * painting the dark-mode mint on white at 1.8:1: illegible as text and under
 * even the 3:1 non-text floor as the progress ring. Setting an ATTRIBUTE lets
 * the cascade pick the right pair for the theme in play, which is the whole
 * reason there are sixteen accent definitions rather than eight.
 *
 * ── Light, Dark and System are three explicit choices ──────────────────────
 *
 * A first visit shows light, whatever the OS prefers: nothing stored reads as
 * `'light'`. System is a choice a person makes, stamped as `data-theme="system"`
 * and stored as `'system'`, and it is the only one that follows the OS and keeps
 * following it when the OS changes at sunset. A device that chose System before
 * this change had no key stored (System used to be the absence of one), so it
 * shows light once and the person picks System again; the two cases can't be told apart.
 *
 * ── The browser bar ─────────────────────────────────────────────────────────
 *
 * One `<meta name="theme-color">` follows the resolved theme. The blocking script
 * sets it before the first paint; `stamp` re-sets it from the root's own `--bg`, so
 * the value comes from `tokens.css` and this file carries no colour.
 *
 * ── Storage ─────────────────────────────────────────────────────────────────
 *
 * Two plain `localStorage` keys, not `StateDoc.settings`. The document is the
 * training record, it syncs to a service and it is hand-edited by a person; a
 * per-device display preference has no business travelling with it, and a phone
 * on dark and a laptop on light is the normal case rather than a conflict. The
 * same two keys are read by the blocking script in `index.html`, which stamps
 * before the first paint — this module is what re-stamps when the choice
 * changes, and the two must agree on the key names.
 */

export type ThemeChoice = "light" | "dark" | "system";

export const ACCENTS = ["mint", "azure", "violet", "magenta", "coral", "amber", "lime", "slate"] as const;

export type Accent = (typeof ACCENTS)[number];

/** Unstamped. Repeated in `tokens.css` as the bare `:root` accent block. */
export const DEFAULT_ACCENT: Accent = "mint";

export const THEME_KEY = "sports-app.theme";
export const ACCENT_KEY = "sports-app.accent";

export function isTheme(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

/**
 * Read a key, and treat every failure as "no preference".
 *
 * `localStorage` does not merely return `null` in a locked-down privacy mode —
 * touching it throws. A theme preference is not worth a blank app, and the
 * unstamped state is a correct answer rather than a fallback.
 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Unstorable. The stamp below still applies for this session. */
  }
}

/** The stored choice, or light when there is none. */
export function readTheme(): ThemeChoice {
  const stored = read(THEME_KEY);
  return isTheme(stored) ? stored : "light";
}

export function readAccent(): Accent {
  const stored = read(ACCENT_KEY);
  return isAccent(stored) ? stored : DEFAULT_ACCENT;
}

/** Point the browser bar at the page colour the stamped theme resolves to. */
export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (meta !== null && bg !== "") meta.setAttribute("content", bg);
}

/**
 * Re-point the browser bar when the OS changes its scheme under a System choice.
 * Returns the function that stops listening.
 */
export function followSystemThemeColor(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (): void => {
    if (document.documentElement.getAttribute("data-theme") === "system") syncThemeColor();
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Stamp and persist. */
export function setTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", choice);
  syncThemeColor();
  write(THEME_KEY, choice);
}

export function setAccent(accent: Accent): void {
  const root = document.documentElement;
  // Mint is what an unstamped root already resolves to, so it is stored as the
  // absence of a choice. That keeps "I never picked one" and "I picked the
  // default" the same state, which is the honest reading of both.
  if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", accent);
  write(ACCENT_KEY, accent === DEFAULT_ACCENT ? null : accent);
}
