// Runs in the default `node` environment — it parses `tokens.css` as text and
// does arithmetic. No DOM, no rendering.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// `noHexColors.test.ts` proves the palette lives in exactly one file. It says
// nothing about whether the values in that file are legible, and those are
// different failures: the first is architectural drift, this one is a user who
// cannot read the target.
//
// It earned its keep twice. The 2026-07-30 dark→white switch could not be an
// inversion — `#6ee7a8` is 1.5:1 on white — so every pair was re-derived at once,
// which is precisely the change where one token quietly lands under the floor.
// Then brief 26 multiplied the problem by sixteen: **two themes × eight accents**,
// each accent carrying its own ink. A palette that size is not reviewable by eye,
// and one shared `--on-accent` across eight fills is the exact mistake this now
// catches — a near-black that reads at 10:1 on lime is under 2:1 on violet.
//
// ── What changed structurally in brief 26 ───────────────────────────────────
//
// The old version flattened every `--name: value` in the file into one map and
// measured that. With one `:root` block that was honest. With twenty-seven blocks
// — bare `:root`, eight light accents, a `prefers-color-scheme` block and a
// `[data-theme]` block each with eight accents of their own, all redefining the
// same three names — a flat "last one wins" map describes a palette **nobody ever
// sees**. So this file now resolves the cascade properly: it parses the blocks,
// works out which apply to a given (theme state, accent), and merges them in
// source order.
//
// Three theme *states* are modelled, not two, because the file has three:
// unstamped-light, unstamped-on-a-dark-OS (the media query), and stamped-dark.
// The contrast matrix runs over light × stamped-dark, and a separate test asserts
// the two dark states are identical — they are duplicated by necessity and that
// duplication is the obvious place for drift.
//
// The pairs are the ones that actually occur, not every combination that could be
// written. `--tx3` on `--s2` is here because it is the input placeholder;
// `--tx3` on `--s3` is not, because `--s3` is the unfilled dot and the ring track
// and carries no text.

// A wildcard, then filtered by name: `import.meta.glob` takes a *pattern*, and
// handing it the exact literal path silently yields an empty record rather than
// the one file — which is why the "parsed the token file" case below is not
// ceremony. (`css: true` in `vite.config.ts` is the other half; without it Vitest
// stubs the module to an empty string and every assertion here passes on nothing.)
const stylesheets = import.meta.glob('../*.css', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const source =
  Object.entries(stylesheets).find(([path]) => path.endsWith('/tokens.css'))?.[1] ?? ''

type Rgb = readonly [number, number, number]

/** The three states the token file actually distinguishes. */
type ThemeState = 'light' | 'dark:preferred' | 'dark:stamped'

/** Everything after `:root` in a token block's selector, decoded. */
type Conditions = {
  readonly theme: 'light' | 'dark' | null
  readonly accent: string | null
}

type Rule = {
  readonly media: 'dark' | null
  readonly selector: string
  readonly decls: ReadonlyMap<string, string>
}

const ACCENTS = [
  'mint',
  'azure',
  'violet',
  'magenta',
  'coral',
  'amber',
  'lime',
  'slate',
] as const

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Split a stylesheet into `prelude { body }` pairs at one nesting level.
 *
 * A real CSS parser is overkill and a regex is not enough — `@media` bodies
 * contain braces — so this counts depth. `@import` is stripped beforehand
 * because it has no body and would otherwise be swallowed into the prelude of
 * whatever block comes next.
 */
function blocksOf(css: string): ReadonlyArray<{ prelude: string; body: string }> {
  const out: Array<{ prelude: string; body: string }> = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = 0
  let prelude = ''
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) {
        prelude = css.slice(preludeStart, i).trim()
        bodyStart = i + 1
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push({ prelude, body: css.slice(bodyStart, i) })
        preludeStart = i + 1
      }
    }
  }
  return out
}

/** Every `--name: value;` directly inside one block body. */
function declsOf(body: string): ReadonlyMap<string, string> {
  const decls = new Map<string, string>()
  // Nested blocks (a `@media` body) are stripped first so their declarations are
  // not attributed to the parent.
  const flat = body.replace(/\{[^{}]*\}/g, '')
  for (const match of flat.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    decls.set(match[1]!, match[2]!.replace(/\s+/g, ' ').trim())
  }
  return decls
}

/**
 * Flatten the file into palette rules, and **throw on anything unrecognised**.
 *
 * Throwing rather than skipping is the point. A parser that quietly ignores a
 * block it does not understand turns "I added a `[data-density]` variant" into a
 * silently untested palette, which is the same class of bug as the empty glob.
 */
function rulesOf(css: string): ReadonlyArray<Rule> {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '')
  const rules: Rule[] = []
  for (const { prelude, body } of blocksOf(cleaned)) {
    if (prelude.startsWith('@font-face') || prelude.startsWith('@theme')) continue
    if (prelude.startsWith('@media')) {
      if (/prefers-reduced-motion/.test(prelude)) continue
      if (!/prefers-color-scheme\s*:\s*dark/.test(prelude)) {
        throw new Error(`tokens.css has an unmodelled media block: ${prelude}`)
      }
      for (const nested of blocksOf(body)) {
        rules.push({
          media: 'dark',
          selector: nested.prelude,
          decls: declsOf(nested.body),
        })
      }
      continue
    }
    if (prelude.startsWith('@')) {
      throw new Error(`tokens.css has an unmodelled at-rule: ${prelude}`)
    }
    rules.push({ media: null, selector: prelude, decls: declsOf(body) })
  }
  return rules
}

/** Decode `:root:not([data-theme='light'])[data-accent='lime']` and friends. */
function conditionsOf(selector: string): Conditions {
  let rest = selector.trim()
  if (!rest.startsWith(':root')) {
    throw new Error(`tokens.css has a palette block not rooted at :root — ${selector}`)
  }
  rest = rest.slice(':root'.length)
  let theme: 'light' | 'dark' | null = null
  let accent: string | null = null
  while (rest.length > 0) {
    const notLight = /^:not\(\[data-theme=['"]light['"]\]\)/.exec(rest)
    const stamped = /^\[data-theme=['"](light|dark)['"]\]/.exec(rest)
    const onAccent = /^\[data-accent=['"]([a-z0-9-]+)['"]\]/.exec(rest)
    if (notLight !== null) {
      theme = 'dark'
      rest = rest.slice(notLight[0].length)
    } else if (stamped !== null) {
      theme = stamped[1] as 'light' | 'dark'
      rest = rest.slice(stamped[0].length)
    } else if (onAccent !== null) {
      accent = onAccent[1]!
      rest = rest.slice(onAccent[0].length)
    } else {
      throw new Error(`tokens.css has an unmodelled selector fragment: ${selector}`)
    }
  }
  return { theme, accent }
}

const RULES = rulesOf(source)

/** Whether one parsed rule is in force for a theme state. */
function inForce(rule: Rule, state: ThemeState): boolean {
  if (rule.media === 'dark') return state === 'dark:preferred'
  const { theme } = conditionsOf(rule.selector)
  if (theme === 'dark') return state === 'dark:stamped'
  if (theme === 'light') return state === 'light'
  return true
}

/**
 * Whether a rule is *specific to* a state, as opposed to merely in force there.
 *
 * The distinction matters: the light accent blocks are unconditional, so they are
 * in force under dark too (the dark blocks override them later). Asking "which
 * block declares lime for stamped dark" has to mean the block written for it.
 */
function declaredIn(rule: Rule, state: ThemeState): boolean {
  const { theme } = conditionsOf(rule.selector)
  if (state === 'dark:preferred') return rule.media === 'dark'
  if (state === 'dark:stamped') return rule.media === null && theme === 'dark'
  return rule.media === null && theme === null
}

/**
 * The tokens in force for one theme state and one accent, cascade resolved.
 *
 * Source order stands in for specificity, which is sound only because the file
 * is written so the two agree: every block that overrides another is both more
 * specific and later. `tokens.css` says so in its header and this relies on it.
 */
function paletteFor(state: ThemeState, accent: string): ReadonlyMap<string, string> {
  const merged = new Map<string, string>()
  for (const rule of RULES) {
    if (!inForce(rule, state)) continue
    const { accent: onAccent } = conditionsOf(rule.selector)
    if (onAccent !== null && onAccent !== accent) continue
    for (const [name, value] of rule.decls) merged.set(name, value)
  }
  return merged
}

// ── Colour ──────────────────────────────────────────────────────────────────

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
 * backdrop it is actually painted on. An `rgba()` wash has no contrast ratio of
 * its own — only the composite does, which is the step it is easy to skip and
 * then ship a 2:1 label on a tint.
 */
function resolve(
  palette: ReadonlyMap<string, string>,
  token: string,
  backdrop: Rgb,
): Rgb {
  const value = palette.get(token)
  if (value === undefined) throw new Error(`this palette defines no ${token}`)

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

// ── The matrix ──────────────────────────────────────────────────────────────

/** `[foreground, background, minimum, where it occurs]`. */
type Pair = readonly [string, string, number, string]

/**
 * 4.5:1 is AA for body text and this app takes no large-text discount — the
 * accessibility doctrine says so explicitly. 3:1 is the non-text floor for
 * anything that carries meaning by its shape.
 *
 * Generated rather than written out, because sixteen hand-maintained copies of
 * the same list is sixteen chances for one of them to lose a pair silently.
 */
function pairsFor(): ReadonlyArray<Pair> {
  const pairs: Pair[] = []

  // Body, prose and placeholder ink on each surface that actually carries text.
  // `--s3` is absent on purpose: it is the ring track and the unfilled set dot.
  for (const ink of ['--tx', '--tx2', '--tx3'] as const) {
    for (const surface of ['--bg', '--s1', '--s2'] as const) {
      pairs.push([ink, surface, 4.5, 'body, prose and placeholder ink'])
    }
  }

  // The accent is a *text* role here, not only a graphic one: the current tab
  // label, the stat-tile delta and the safety eyebrow are all painted in it. That
  // is the constraint that forces a separate light-theme accent ramp — the
  // reference build's mint is 1.8:1 on white.
  for (const surface of ['--bg', '--s1', '--s2'] as const) {
    pairs.push(['--accent', surface, 4.5, 'tab label, tile delta, eyebrow'])
  }

  // Each accent's own ink, on both ends of the primary button's gradient. The
  // second pair is the one a single shared ink fails first.
  pairs.push(['--on-accent', '--accent', 4.5, 'the primary button label, flat'])
  pairs.push([
    '--on-accent',
    '--accent-2',
    4.5,
    'the same label over the gradient start',
  ])

  // Non-text. The ring arc has to read against its own track, not just the page.
  pairs.push(['--accent-2', '--bg', 3, 'the gradient start of the progress ring'])
  pairs.push(['--accent', '--grid0', 3, 'the filled arc against the unfilled track'])

  // Semantics, on the ground and on their own washes. The wash is translucent, so
  // `resolve` composites it over `--bg` before either is measured.
  pairs.push(['--warn', '--bg', 4.5, 'the disclosure icon and label'])
  pairs.push(['--dang', '--bg', 4.5, 'the stop-rule icon and label'])
  pairs.push(['--warn', '--warn-bg', 4.5, 'the streak pill and the disclosure heading'])
  pairs.push(['--tx', '--warn-bg', 4.5, 'the disclosure body copy on its tint'])
  pairs.push(['--dang', '--dang-bg', 4.5, 'a missed day in the calendar'])
  pairs.push(['--tx', '--dang-bg', 4.5, 'body copy on the danger tint'])

  return pairs
}

const PAIRS = pairsFor()

/** Sixteen palettes. The two dark states are asserted identical further down. */
const MEASURED: ReadonlyArray<ThemeState> = ['light', 'dark:stamped']

describe('the token file was actually parsed', () => {
  // A test that greps a file it failed to open is green and worthless, and this
  // repo has shipped that bug three times.
  it('found tokens.css and read a real cascade out of it', () => {
    expect(source).toContain(':root')
    expect(RULES.length).toBeGreaterThan(10)
    expect(paletteFor('light', 'mint').size).toBeGreaterThan(20)
  })

  it('names every accent the file claims to ship', () => {
    const declared = new Set(
      RULES.map((rule) => conditionsOf(rule.selector).accent).filter(
        (accent): accent is string => accent !== null,
      ),
    )
    expect([...declared].sort()).toEqual([...ACCENTS].sort())
  })
})

describe('the palette is legible', () => {
  for (const state of MEASURED) {
    for (const accent of ACCENTS) {
      describe(`${state} · ${accent}`, () => {
        const palette = paletteFor(state, accent)
        const ground = resolve(palette, '--bg', [255, 255, 255])

        for (const [fg, bg, min, where] of PAIRS) {
          it(`${fg} on ${bg} clears ${min}:1 — ${where}`, () => {
            const backdrop = resolve(palette, bg, ground)
            const ratio = contrast(resolve(palette, fg, backdrop), backdrop)
            expect(
              ratio,
              `${state}/${accent}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(min)
          })
        }
      })
    }
  }
})

describe('the documented exceptions stay exceptions', () => {
  // Asserting a *ceiling* rather than a floor, which is deliberate. Surfaces are
  // containers and the ring track is decorative — the numeral inside carries the
  // value — and `design-system.md` records that brightening either into a
  // competing grey ring is a regression. Without this, the next person to run an
  // accessibility sweep "fixes" it and the ring starts shouting.
  for (const state of MEASURED) {
    describe(state, () => {
      const palette = paletteFor(state, 'mint')
      const ground = resolve(palette, '--bg', [255, 255, 255])

      for (const token of ['--s1', '--s2', '--s3', '--grid0'] as const) {
        it(`${token} stays below the 3:1 non-text floor, on purpose`, () => {
          expect(contrast(resolve(palette, token, ground), ground)).toBeLessThan(3)
        })
      }

      it('the surface ramp ascends away from the canvas without becoming a line', () => {
        const ratios = (['--s1', '--s2', '--s3'] as const).map((token) =>
          contrast(resolve(palette, token, ground), ground),
        )
        expect(ratios).toEqual([...ratios].sort((a, b) => a - b))
        expect(ratios[0]).toBeGreaterThan(1)
      })
    })
  }
})

describe('the three theme states are wired the way the header claims', () => {
  // The whole reason the file is ordered the way it is. A colour whose only
  // definition lives inside a media or `[data-theme]` block is simply unset in the
  // unstamped light state, and `var(--x)` then resolves to nothing — a failure
  // that looks like "the text vanished", not like "the text is the wrong grey".
  it('declares every token in bare :root before any block overrides it', () => {
    // The union of the *unconditional* blocks — the main `:root` and the brief-27
    // alias shim. Compared against what the conditional blocks declare, not
    // against a resolved palette: a resolved dark palette contains the bare
    // declarations by construction, so comparing those would assert nothing.
    const unconditional = new Set(
      RULES.filter((rule) => declaredIn(rule, 'light')).flatMap((rule) => [
        ...rule.decls.keys(),
      ]),
    )
    const conditional = RULES.filter((rule) => !declaredIn(rule, 'light'))
    expect(conditional.length).toBeGreaterThan(0)
    for (const rule of conditional) {
      for (const token of rule.decls.keys()) {
        expect(
          unconditional.has(token),
          `${token} is declared only under "${rule.selector}"`,
        ).toBe(true)
      }
    }
  })

  // Two spellings of one condition, because CSS offers no way to say "these two
  // produce the same declarations". Nothing but this stops them drifting.
  it('resolves the media-query dark and the stamped dark to the same palette', () => {
    for (const accent of ACCENTS) {
      const preferred = paletteFor('dark:preferred', accent)
      const stamped = paletteFor('dark:stamped', accent)
      expect(
        Object.fromEntries(preferred),
        `${accent} differs between prefers-color-scheme and [data-theme="dark"]`,
      ).toEqual(Object.fromEntries(stamped))
    }
  })

  // Each accent block must replace the whole triple. One that set only `--accent`
  // would leave the previous accent's ink behind — and because the ink it leaves
  // behind is a real, legible colour, the contrast matrix would happily declare
  // the result safe.
  it('gives every accent a complete triple in every theme state', () => {
    for (const state of ['light', 'dark:preferred', 'dark:stamped'] as const) {
      for (const accent of ACCENTS) {
        const rule = RULES.find(
          (candidate) =>
            conditionsOf(candidate.selector).accent === accent &&
            declaredIn(candidate, state),
        )
        expect(rule, `${state} has no block for ${accent}`).toBeDefined()
        expect([...rule!.decls.keys()].sort()).toEqual([
          '--accent',
          '--accent-2',
          '--on-accent',
        ])
      }
    }
  })
})
