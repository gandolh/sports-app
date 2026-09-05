import { useState } from 'react'
import type { ReactNode } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LADDERS, getRung, topRungIndex } from '../../domain/ladders.ts'
import { rangeAt, rungIndexAt } from '../../domain/schedule.ts'
import { milestonesReached, totalWork } from '../../domain/milestones.ts'
import { PATTERNS } from '@sports-app/shared/types.ts'
import type { Pattern, StateDoc } from '@sports-app/shared/types.ts'
import { clearCurrentUsername } from '../../persistence/session.ts'
import { rootRoute } from './__root.tsx'
import { useDocument, useStartFresh } from '../document.ts'
import { AlertBanner } from '../components/AlertBanner.tsx'
import { QuietButton, SecondaryButton } from '../components/Buttons.tsx'
import { SyncSettings } from '../components/SyncSettings.tsx'
import { TabBar } from '../components/TabBar.tsx'
import { Eyebrow, SectionHeading, Shell, ShellBody, ShellRail, ShellTitle } from '../components/Shell.tsx'
import {
  ACCENTS,
  readAccent,
  readTheme,
  setAccent,
  setTheme,
} from '../components/theme.ts'
import type { Accent, ThemeChoice } from '../components/theme.ts'
import { PATTERN_LABEL, formatHoldTime, groupDigits } from '../components/format.ts'

/**
 * `/account` — who you are, what you have reached, and how much you have done.
 *
 * ── There is no chart, and that is the design being honest ──────────────────
 *
 * The prescription is a pure function of session count, so plotting it against
 * session number draws a straight line containing no information. Nothing here is
 * a visualisation of progress because there is no measured progress to visualise:
 * every number on this page is work **prescribed**, summed from history, not work
 * verified. The app measures nothing (corpus/wiki/decisions.md), and the totals say
 * so in a sentence rather than pretending. `/progress` plots the schedule's own
 * shape instead, which is a different claim — see that screen's header.
 *
 * Milestones are the one thing a fixed schedule can honestly celebrate, and they
 * key off session **number**, never a date. `/progress` lists the same
 * `milestonesReached` output next to the chart that explains why they land where
 * they do; the two lists are allowed to look different because they answer
 * different questions.
 *
 * ── It also carries the two things nothing else can ─────────────────────────
 *
 * The sync settings, because deleting the old settings screen left
 * `client/src/persistence/sync.ts` with no way in at all — see
 * `../components/SyncSettings.tsx`. And the way out of the read-only latch: a
 * user whose stored document cannot be read is told so on every screen, but this
 * is the only one that offers the export and then the replacement, in that order.
 */

export const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  beforeLoad: ({ context }) => {
    if (context.username === null) throw redirect({ to: '/login' })
    return { username: context.username }
  },
  component: AccountRoute,
})

function AccountRoute() {
  const { username } = accountRoute.useRouteContext()
  const navigate = useNavigate()
  const { data: snapshot } = useDocument(username)

  function logOut(): void {
    clearCurrentUsername()
    void navigate({ to: '/login' })
  }

  return (
    <Shell>
      <ShellRail>Account</ShellRail>
      <ShellTitle title={username} />
      <ShellBody>
        {snapshot.readOnly === null ? null : (
          <AlertBanner label="Read-only" text={snapshot.readOnly} />
        )}

        {snapshot.doc === null ? (
          <>
            <p className="mt-[var(--sp-3)] text-body text-tx2">
              The stored document could not be read, so there is nothing to total up here.
            </p>
            <Recovery username={username} rawText={snapshot.rawText} />
          </>
        ) : (
          <AccountBody doc={snapshot.doc} />
        )}

        {snapshot.doc === null ? null : <SyncSettings doc={snapshot.doc} username={username} />}

        <Appearance />

        <SectionHeading>Session</SectionHeading>
        <p className="text-body text-tx2">
          Logging out forgets which account this browser is showing. Every training history stays
          exactly where it is.
        </p>
        <div className="mt-[var(--sp-2)]">
          <SecondaryButton onClick={logOut}>Log out</SecondaryButton>
        </div>
      </ShellBody>
      <TabBar active="you" />
    </Shell>
  )
}

function AccountBody({ doc }: { readonly doc: StateDoc }) {
  const work = totalWork(doc)
  const milestones = milestonesReached(doc)
  const ceilings = PATTERNS.filter(
    (pattern) => rungIndexAt(pattern, doc.sessionsDone[pattern]) === topRungIndex(pattern),
  )

  return (
    <>
      <div className="grid place-items-center py-[var(--sp-6)] text-center">
        <span className="block text-mono leading-none font-extrabold tracking-[var(--ls-hero)] tabular-nums">
          {groupDigits(work.sessions)}
        </span>
        <span className="mt-[var(--sp-2)] block">
          <Eyebrow>{work.sessions === 1 ? 'session completed' : 'sessions completed'}</Eyebrow>
        </span>
      </div>

      <SectionHeading>Total work ever</SectionHeading>
      <TotalsCard>
        <Row label="Reps" value={groupDigits(work.reps)} />
        <Row label="Time held" value={formatHoldTime(work.holdSeconds)} />
        {PATTERNS.map((pattern) => (
          <Row key={pattern} label={PATTERN_LABEL[pattern]} value={patternTotal(work.perPattern[pattern], pattern)} />
        ))}
      </TotalsCard>
      <p className="mt-[var(--sp-2)] text-meta text-tx2">
        This is work the schedule asked for, added up. The app never learns what you actually did,
        so it cannot claim more than that — and it is still the largest true number here.
      </p>

      {ceilings.length === 0 ? null : (
        <>
          <SectionHeading>Ladders finished</SectionHeading>
          {ceilings.map((pattern) => (
            <p key={pattern} className="mt-[var(--sp-2)] text-body text-tx2">
              {ceilingSentence(pattern)}
            </p>
          ))}
        </>
      )}

      <SectionHeading>Milestones</SectionHeading>
      {milestones.length === 0 ? (
        <p className="text-body text-tx2">
          Nothing yet — the first one lands the first time a ladder moves up a rung, about six
          weeks in. Start a session from the home screen.
        </p>
      ) : (
        <ol>
          {milestones.map((milestone, index) => (
            <li
              key={`${milestone.sessionNumber}-${index}`}
              data-testid="milestone"
              className="mt-[var(--sp-2)] rounded border border-line bg-s1 p-[var(--sp-3)] shadow-1"
            >
              <span data-testid="milestone-ordinal">
                <Eyebrow className="text-tx3 tabular-nums">{`Session ${milestone.sessionNumber}`}</Eyebrow>
              </span>
              <p className="mt-[2px] text-body text-tx">{milestone.label}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** A bordered card of hairline-separated rows — the one repeated shape on this page. */
/**
 * The theme and the accent, which are the only two settings in the app.
 *
 * They live here rather than behind a gear icon because there is no gear icon
 * and adding one for two controls would be a navigation layer for a preference
 * most people set once. The account screen is already where everything that is
 * about *this browser* rather than about the training lives.
 *
 * ── Why "System" is the absence of a choice, not a third theme ──────────────
 *
 * `setTheme(null)` removes the attribute rather than writing `'light'`, so the
 * page falls back to `prefers-color-scheme` and keeps following the OS when the
 * OS changes at sunset. Writing `'light'` would look identical on the day it was
 * picked and then stop tracking, which is the bug people report as "it went dark
 * on its own". The same reasoning makes mint an unstamped root rather than
 * `data-accent="mint"`.
 *
 * State is seeded from the DOM by way of `readTheme`/`readAccent`, so it agrees
 * with the stamp `main.tsx` already applied instead of assuming a default and
 * flickering to it on mount.
 */
function Appearance() {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readTheme())
  const [accent, setAccentState] = useState<Accent>(() => readAccent())

  function chooseTheme(choice: ThemeChoice): void {
    setTheme(choice)
    setThemeState(choice)
  }

  function chooseAccent(choice: Accent): void {
    setAccent(choice)
    setAccentState(choice)
  }

  const themes: readonly { readonly value: ThemeChoice; readonly label: string }[] = [
    { value: null, label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  return (
    <>
      <SectionHeading>Appearance</SectionHeading>

      <Eyebrow>Theme</Eyebrow>
      <div role="radiogroup" aria-label="Theme" className="mt-[var(--sp-2)] flex gap-[var(--sp-2)]">
        {themes.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => chooseTheme(value)}
            className={`min-h-[var(--tap-row)] flex-1 rounded border text-btn font-semibold ${
              theme === value ? 'border-accent text-accent' : 'border-line2 text-tx2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-[var(--sp-4)]">
        <Eyebrow>Accent</Eyebrow>
      </div>
      {/*
        Named options rather than colour swatches, and that is a correction
        rather than a preference.

        A swatch has to paint its own hue, which means re-pointing `--accent` on
        the button — and every accent block in `tokens.css` is written
        `:root[data-accent='…']`, with the dark variants needing the theme stamp
        on that same element too. A per-button stamp therefore matches nothing
        and every swatch renders the accent already in use: eight identical dots
        claiming to be eight colours. Making the blocks element-scoped would mean
        duplicating the theme logic into each one, which is a real cost for a
        22px dot.

        So the name is the label and the app itself is the preview: picking one
        re-stamps the root immediately, and the border and text below, the tab
        bar, the ring and every primary button change under the finger. That is a
        larger and more honest sample than a swatch, and it cannot drift from
        `tokens.css` the way a duplicated hex would.
      */}
      <div
        role="radiogroup"
        aria-label="Accent colour"
        className="mt-[var(--sp-2)] grid grid-cols-4 gap-[var(--sp-2)]"
      >
        {ACCENTS.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={accent === name}
            onClick={() => chooseAccent(name)}
            className={`min-h-[var(--tap-row)] rounded border text-meta font-semibold capitalize ${
              accent === name ? 'border-accent text-accent' : 'border-line2 text-tx2'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </>
  )
}

function TotalsCard({ children }: { readonly children: ReactNode }) {
  return <div className="mt-[var(--sp-2)] rounded border border-line bg-s1 shadow-1">{children}</div>
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-[var(--sp-2)] border-b border-line px-[var(--sp-3)] py-[var(--sp-2)] last:border-b-0">
      <span className="text-body text-tx2">{label}</span>
      <span className="text-body font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * The way out of the read-only latch: export first, replace second.
 *
 * ── The order is the whole design ───────────────────────────────────────────
 *
 * The stored text is untouched and is usually repairable by hand — a truncated
 * write, a stray character from a hand-edit, a JSON file that lost its last brace.
 * So the download comes first and the destructive control second, and the second
 * takes **two taps**: nothing else in this app asks for a confirmation, and this
 * is the one action that can destroy months of training history. It is also the
 * only place `allowOverwriteCorrupt` is passed anywhere in the app.
 *
 * A confirm-in-place rather than a dialog, because there is no modal anywhere in
 * this app and a second tap on a button that has changed its own label says the
 * same thing with less machinery.
 */
function Recovery({
  username,
  rawText,
}: {
  readonly username: string
  readonly rawText: string | null
}) {
  const startFresh = useStartFresh(username)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <SectionHeading>Recovery</SectionHeading>
      <p className="text-body text-tx2">
        Nothing has been written and nothing will be until you say so. Take a copy of the file
        first: it is plain JSON, the problem is often one character, and a text editor is a better
        repair tool than anything this app could offer.
      </p>

      <div className="mt-[var(--sp-2)]">
        {rawText === null ? (
          <p className="text-meta text-tx3">
            The stored text could not be read back either, so there is nothing to download.
          </p>
        ) : (
          <SecondaryButton
            onClick={() => downloadText(`${username}-training-history.json`, rawText)}
          >
            Download the file
          </SecondaryButton>
        )}
      </div>

      <p className="mt-[var(--sp-2)] text-meta text-tx2">
        Replacing it starts every ladder at the bottom rung and every counter at zero. The
        downloaded copy is then the only one that exists.
      </p>

      {startFresh.error === null ? null : (
        <AlertBanner label="Not replaced" text={startFresh.error.message} />
      )}

      <div className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-2)]">
        {confirming ? (
          <>
            <SecondaryButton onClick={() => setConfirming(false)}>Keep it</SecondaryButton>
            <QuietButton onClick={() => startFresh.mutate()}>
              {startFresh.isPending ? 'Replacing…' : 'Yes, replace it'}
            </QuietButton>
          </>
        ) : (
          <QuietButton onClick={() => setConfirming(true)}>
            Replace it with an empty history
          </QuietButton>
        )}
      </div>
    </>
  )
}

/**
 * Hand the bytes back, unchanged.
 *
 * Capability-checked rather than assumed: `createObjectURL` is absent in some
 * embedded webviews and in the test renderer, and a recovery screen that throws
 * is worse than one whose download button does nothing. The revoke is deferred to
 * a task rather than done inline — revoking before the browser has started the
 * download cancels it in WebKit.
 */
function downloadText(filename: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** One line per pattern, in that ladder's own unit — reps and seconds do not add. */
function patternTotal(
  totals: { readonly reps: number; readonly holdSeconds: number },
  pattern: Pattern,
): string {
  if (LADDERS[pattern].unit === 'seconds') return formatHoldTime(totals.holdSeconds)
  return `${groupDigits(totals.reps)} reps`
}

/**
 * Stated plainly and without hedging, because it is a real finish rather than a
 * failure: at the top of a ladder the target cycles bottom→top→bottom forever,
 * which is the honest ceiling of what floor-only training offers.
 */
function ceilingSentence(pattern: Pattern): string {
  const top = topRungIndex(pattern)
  const rung = getRung(pattern, top)
  const range = rangeAt(pattern, top)
  const unit = LADDERS[pattern].unit === 'reps' ? 'reps' : 'seconds'
  return (
    `${PATTERN_LABEL[pattern]} has reached the top of its ladder — ${rung.name}. ` +
    `There is no rung above it, so the target now cycles between ${range.min} and ` +
    `${range.max} ${unit} and keeps cycling. That is the ceiling of what floor-only ` +
    `training offers, and reaching it is a finish.`
  )
}
