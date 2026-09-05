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
 * ── The three theme states are three, not two ───────────────────────────────
 *
 * `null` is not "light". An unstamped root follows the OS and keeps following it
 * when the OS changes at sunset; an explicit `'light'` opts out of that
 * permanently. Collapsing them into a boolean is how a user who never touched
 * the setting ends up pinned to whatever they happened to be on the first time
 * the app ran.
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

export type Theme = 'light' | 'dark'

/** `null` = follow the OS. See the header: this is a third state, not a default. */
export type ThemeChoice = Theme | null

export const ACCENTS = [
  'mint',
  'azure',
  'violet',
  'magenta',
  'coral',
  'amber',
  'lime',
  'slate',
] as const

export type Accent = (typeof ACCENTS)[number]

/** Unstamped. Repeated in `tokens.css` as the bare `:root` accent block. */
export const DEFAULT_ACCENT: Accent = 'mint'

export const THEME_KEY = 'sports-app.theme'
export const ACCENT_KEY = 'sports-app.accent'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value)
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
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* Unstorable. The stamp below still applies for this session. */
  }
}

export function readTheme(): ThemeChoice {
  const stored = read(THEME_KEY)
  return isTheme(stored) ? stored : null
}

export function readAccent(): Accent {
  const stored = read(ACCENT_KEY)
  return isAccent(stored) ? stored : DEFAULT_ACCENT
}

/**
 * Stamp and persist. Removing the attribute — rather than setting it to
 * `'light'` — is what returns the page to following the OS.
 */
export function setTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === null) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  write(THEME_KEY, choice)
}

export function setAccent(accent: Accent): void {
  const root = document.documentElement
  // Mint is what an unstamped root already resolves to, so it is stored as the
  // absence of a choice. That keeps "I never picked one" and "I picked the
  // default" the same state, which is the honest reading of both.
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', accent)
  write(ACCENT_KEY, accent === DEFAULT_ACCENT ? null : accent)
}

