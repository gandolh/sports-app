// Runs in the default `node` environment — it parses `tokens.css` as text and
// does arithmetic. No DOM, no rendering.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// `noHexColors.test.ts` proves the palette lives in exactly one file. It says
// nothing about whether the values in that file are legible, and those are
// different failures: the first is architectural drift, this one is a user on a
// floor at arm's length who cannot read the target.
//
// It earned its keep immediately. The 2026-07-30 dark→white switch could not be
// an inversion — `#6ee7a8` is 1.5:1 on white — so every pair in the palette was
// re-derived at once, which is precisely the change where a single token quietly
// lands under the floor and nobody notices for six months.
//
// The pairs below are the ones that actually occur in `app.css`, not every
// combination that could be written. `--text-3` on `--surface-2` is here because
// it is the input placeholder; `--text-3` on `--surface-3` is not, because
// nothing puts it there.
// A wildcard, then filtered by name: `import.meta.glob` takes a *pattern*, and
// handing it the exact literal path silently yields an empty record rather than
// the one file — which is why the "parsed the token file" case below is not
// ceremony.
const stylesheets = import.meta.glob('../*.css', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const source =
  Object.entries(stylesheets).find(([path]) => path.endsWith('/tokens.css'))?.[1] ?? ''

type Rgb = readonly [number, number, number]

/** Every `--name: value` in the `:root` block, verbatim. */
function readTokens(css: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>()
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    tokens.set(match[1]!, match[2]!.trim())
  }
  return tokens
}

const TOKENS = readTokens(source)

function hexToRgb(hex: string): Rgb {
  const raw = hex.replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Resolve a token to a solid colour, compositing a translucent one over the
 * backdrop it is actually painted on. A `rgba()` wash has no contrast ratio of
 * its own — only the composite does, which is the step it is easy to skip and
 * then ship a 2:1 label on a tint.
 */
function resolve(token: string, backdrop: Rgb): Rgb {
  const value = TOKENS.get(token)
  if (value === undefined) throw new Error(`tokens.css defines no ${token}`)

  if (value.startsWith('#')) return hexToRgb(value)

  const rgba = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value)
  if (rgba === null) throw new Error(`${token} is neither a hex nor an rgba(): ${value}`)

  const alpha = rgba[4] === undefined ? 1 : Number(rgba[4])
  const src: Rgb = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]
  return src.map((channel, i) => channel * alpha + backdrop[i]! * (1 - alpha)) as unknown as Rgb
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const BG = () => resolve('--bg', [255, 255, 255])

/**
 * `[foreground, background, minimum, where it occurs]`.
 *
 * 4.5:1 is AA for body text and this app takes no large-text discount — the
 * accessibility doctrine says so explicitly, because a floor phone at ~60–70cm
 * makes even the hero numeral subtend less than its px size suggests.
 * 3:1 is the non-text floor for anything that carries meaning by its shape.
 */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ['--text-1', '--bg', 4.5, 'body copy, milestone labels, the hero numeral'],
  ['--text-2', '--bg', 4.5, 'prose, cues, plan detail, figure stroke'],
  ['--text-3', '--bg', 4.5, 'rail status, section eyebrows, ordinals'],
  ['--text-3', '--surface-1', 4.5, 'ordinals inside the next-session cell'],
  ['--text-3', '--surface-2', 4.5, 'the input placeholder on /login'],
  ['--text-1', '--surface-2', 4.5, 'the secondary button label'],
  ['--text-2', '--surface-2', 4.5, 'the connection-check result label'],
  ['--accent', '--bg', 4.5, 'the safety eyebrow, the next-session ordinal'],
  ['--on-accent', '--accent', 4.5, 'the primary button label'],
  ['--on-accent', '--accent-press', 4.5, 'the primary button, held down'],
  ['--accent', '--accent-wash', 4.5, 'the SAFETY label on its tint'],
  ['--text-1', '--accent-wash', 4.5, 'the safety cue text on its tint'],
  ['--warn', '--bg', 4.5, 'the field error on /login'],
  ['--warn', '--warn-wash', 4.5, 'the banner label on its tint'],
  ['--text-1', '--warn-wash', 4.5, 'the store banner text on its tint'],
]

const NON_TEXT_PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ['--accent', '--bg', 3, 'the countdown ring progress, cue ticks, filled dots'],
  ['--text-3', '--bg', 3, 'the border of an unfilled dot'],
]

describe('the palette is legible', () => {
  it('parsed the token file (guards against a silently empty glob)', () => {
    expect(source).toContain(':root')
    expect(TOKENS.size).toBeGreaterThan(20)
  })

  for (const [fg, bg, min, where] of [...TEXT_PAIRS, ...NON_TEXT_PAIRS]) {
    it(`${fg} on ${bg} clears ${min}:1 — ${where}`, () => {
      const backdrop = resolve(bg, BG())
      const ratio = contrast(resolve(fg, backdrop), backdrop)
      expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    })
  }
})

describe('the documented exceptions stay exceptions', () => {
  /**
   * Asserting a *ceiling* rather than a floor, which is deliberate and is the
   * only such assertion here. The ring's track is decorative — the numeral
   * inside carries the value — and `design-system.md` records that brightening
   * it into a competing grey ring is a regression. Without this, the next person
   * to run an accessibility sweep "fixes" it and the ring starts shouting.
   */
  it('the countdown ring track stays below the 3:1 non-text floor, on purpose', () => {
    const bg = BG()
    expect(contrast(resolve('--surface-3', bg), bg)).toBeLessThan(3)
  })

  /** Surfaces are containers. If one reached 3:1 it would read as a border. */
  it('the surface ramp ascends away from the canvas without becoming a line', () => {
    const bg = BG()
    const ratios = (['--surface-1', '--surface-2', '--surface-3'] as const).map((token) =>
      contrast(resolve(token, bg), bg),
    )
    expect(ratios).toEqual([...ratios].sort((a, b) => a - b))
    expect(ratios[0]).toBeGreaterThan(1)
    expect(ratios[2]).toBeLessThan(3)
  })
})
