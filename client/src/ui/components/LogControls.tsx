import { useId, useState } from 'react'
import { motion } from 'motion/react'
import type { TargetUnit } from '@sports-app/shared/types.ts'
import { SecondaryButton } from './Buttons.tsx'
import { CheckIcon, PencilIcon } from './icons.tsx'
import { unitWord } from './format.ts'

/**
 * `Log 8` and `Log other`, beside Next. **Offered, never demanded.**
 *
 * ── The single most important thing about this component ────────────────────
 *
 * Skipping it is a first-class path, not a dismissal. There is no "skip"
 * button, because a skip button frames not-logging as declining something; there
 * is no toast, no nag, no red dot, and no state in which Next is any harder to
 * reach because these were ignored. Two of the three values the codec keeps
 * apart mean "no answer" and "did nothing" (`ExerciseRecord.logged`), and the
 * first of those is the **normal** case — the default walk through the player
 * touches nothing in this file at all.
 *
 * That is not politeness. The governing invariant is that no logged value ever
 * reaches `prescribe()` (corpus/CLAUDE.md): the schedule is identical whether
 * you log everything or nothing, so demanding a number would be demanding it for
 * the app's benefit rather than the user's, and there is no benefit — the app
 * cannot act on it and has promised not to try.
 *
 * ── Why `Log 8` is one tap and not a stepper ────────────────────────────────
 *
 * The overwhelmingly common answer is "I did exactly what it said", and a
 * stepper makes that answer four taps away from a number that is already on the
 * screen. `Log other` is the escape hatch for every other answer, including
 * zero, and it opens a plain numeric field rather than a wheel.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 *
 * The panel reveal is the one Framer transition in the player, and it is a
 * transition rather than an entrance: it confirms that a tap opened something.
 * There is deliberately no exit animation — `AnimatePresence` would hold the
 * field in the DOM after it closes, and a "log" input that is still focusable
 * while invisible is worse than an abrupt close. `useReducedMotion` is not
 * consulted because the duration comes from `--dur-fast`, which the token file
 * already collapses to 1ms under the media query.
 */

export interface LogControlsProps {
  /** Today's target for this set. The one-tap answer. */
  readonly target: number
  readonly unit: TargetUnit
  /** What is already logged for THIS set, or `null`. */
  readonly logged: number | null
  /** `null` clears the log for this set. */
  readonly onLog: (value: number | null) => void
}

export function LogControls({ target, unit, logged, onLog }: LogControlsProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const fieldId = useId()

  function submit(): void {
    const parsed = Number(draft.trim())
    // Anything unreadable closes the panel and logs nothing, rather than showing
    // an error. The user is mid-set; a validation message here is an obstacle
    // in front of an optional action.
    if (draft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      onLog(Math.round(parsed))
    }
    setDraft('')
    setOpen(false)
  }

  return (
    <div className="grid gap-[var(--sp-2)]">
      <div className="flex gap-[var(--sp-2)]">
        <SecondaryButton
          onClick={() => onLog(logged === target ? null : target)}
          aria-pressed={logged === target}
          aria-label={
            logged === target
              ? `Logged ${target} ${unitWord(unit, target)}. Tap to remove.`
              : `Log ${target} ${unitWord(unit, target)} for this set.`
          }
          className={logged === target ? 'border-accent text-accent' : ''}
        >
          {logged === target ? <CheckIcon size={18} /> : null}
          {logged === target ? `Logged ${target}` : `Log ${target}`}
        </SecondaryButton>

        <SecondaryButton
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-label="Log a different number for this set"
          className={logged !== null && logged !== target ? 'border-accent text-accent' : ''}
        >
          <PencilIcon size={18} />
          {logged !== null && logged !== target ? `Logged ${logged}` : 'Log other'}
        </SecondaryButton>
      </div>

      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          className="flex items-center gap-[var(--sp-2)]"
        >
          <label htmlFor={fieldId} className="text-meta text-tx2">
            {unit === 'reps' ? 'Reps' : 'Seconds'}
          </label>
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
              if (event.key === 'Escape') setOpen(false)
            }}
            className="h-[var(--tap-row)] min-w-0 flex-1 rounded border border-line2 bg-s2 px-[var(--sp-3)] text-body text-tx tabular-nums"
          />
          <SecondaryButton className="w-auto px-[var(--sp-4)]" onClick={submit}>
            Save
          </SecondaryButton>
        </motion.div>
      ) : null}
    </div>
  )
}
