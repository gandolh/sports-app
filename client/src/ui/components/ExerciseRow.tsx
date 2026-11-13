import type { PrescribedItem } from "../../domain/schedule.ts";
import { LADDERS } from "../../domain/ladders.ts";
import { ExerciseFigure } from "../ExerciseFigure.tsx";
import { SafetyCue } from "./Cues.tsx";
import { PosturalNote } from "./HonestNote.tsx";
import { ChevronIcon, PatternIcon } from "./icons.tsx";
import { itemName, rungSummary, targetLabel, targetText } from "./format.ts";
import { useWide } from "./useMedia.ts";

/**
 * The session as Today shows it: the first exercise open, the rest in a list.
 *
 * ── Up first, and then ──────────────────────────────────────────────────────
 *
 * The first exercise is the one the person is about to do, so it gets the figure
 * (the Squat rig, or whichever the rung names) and its cue sentence in plain
 * sight, with no toggle to find. The others are one row each — a glyph, the name,
 * the target — and a row opens in place to its numbered cues. Both are the
 * prescription as it was: nothing here reads what was logged.
 *
 * Every name wraps to two lines at most and is never cut: "Glute bridge, 2-second
 * hold at the top" is the longest and a clipped name is a different exercise.
 */

interface Words {
  readonly cues: readonly string[];
  /** The line read before starting, on the few rungs that carry one. */
  readonly safety: string | undefined;
  /** The numbered steps: every cue but the safety line. */
  readonly steps: readonly string[];
}

function wordsOf(item: PrescribedItem): Words {
  if (item.type === "cardio") return { cues: item.protocol.cues, safety: undefined, steps: item.protocol.cues };
  const cues = item.rung.cues;
  const safety = item.rung.safetyCritical === true ? cues[0] : undefined;
  return { cues, safety, steps: safety === undefined ? cues : cues.slice(1) };
}

function unitOf(item: PrescribedItem): string {
  return item.type === "cardio" ? "rounds" : item.unit;
}

function metaOf(item: PrescribedItem): string {
  if (item.type === "cardio") return `${item.rounds} rounds · no ladder`;
  const rung = rungSummary(item);
  return `${item.sets} sets${rung === null ? "" : ` · ${rung}`}`;
}

/** One tick a rung: where this one sits on its ladder. */
function RungTicks({ item }: { readonly item: PrescribedItem }) {
  if (item.type === "cardio") return null;
  const total = LADDERS[item.pattern].rungs.length;
  return (
    <div
      aria-hidden="true"
      className="col-span-full mt-[var(--sp-3)] flex max-w-[260px] gap-[var(--sp-1)] min-[840px]:col-span-1 min-[840px]:col-start-2 min-[840px]:row-start-2 min-[840px]:mt-[var(--sp-2)] max-[419px]:mt-[var(--sp-2)]"
    >
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={`block h-2 flex-1 rounded-[3px] ${index === item.rungIndex ? "bg-accent" : "bg-line2"}`}
        />
      ))}
    </div>
  );
}

export function UpFirst({ item }: { readonly item: PrescribedItem }) {
  const wide = useWide();
  const { cues, safety } = wordsOf(item);
  const cue = item.type === "cardio" ? item.protocol.movements.join("  ·  ") : (cues[1] ?? cues[0]);
  return (
    <article
      aria-labelledby="up-first"
      className="rounded-lg border border-line bg-s1 p-[var(--sp-4)] shadow-1 min-[840px]:px-6 min-[840px]:py-5 max-[419px]:px-[var(--sp-4)] max-[419px]:pt-[var(--sp-3)] max-[419px]:pb-[var(--sp-4)] max-[389px]:pb-[var(--sp-3)]"
    >
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 min-[840px]:grid-cols-[176px_minmax(0,1fr)] min-[840px]:gap-x-5 max-[419px]:grid-cols-[80px_minmax(0,1fr)]">
        <div className="col-start-1 row-start-1 grid h-[100px] place-items-center rounded-[12px] bg-s2 text-tx min-[840px]:row-span-3 min-[840px]:h-auto min-[840px]:min-h-[176px] max-[419px]:h-[84px]">
          {item.type === "cardio" ? (
            <span className="text-accent">
              <PatternIcon pattern={null} size={wide ? 96 : 56} />
            </span>
          ) : (
            <ExerciseFigure rung={item.rung} size={wide ? 160 : 76} />
          )}
        </div>
        <div className="col-start-2 row-start-1 min-w-0">
          <h2
            id="up-first"
            className="mb-[var(--sp-1)] text-label leading-4 font-bold text-accent min-[840px]:text-[1.0625rem] min-[840px]:leading-[1.3]"
          >
            Up first
          </h2>
          <div className="min-[840px]:flex min-[840px]:items-start min-[840px]:justify-between min-[840px]:gap-4">
            <div>
              <h3 className="text-[1.375rem] leading-[1.2] font-bold tracking-[-0.01em] min-[840px]:text-name-l">
                {itemName(item)}
              </h3>
              <p className="text-meta leading-[1.33] text-tx2">{metaOf(item)}</p>
            </div>
            <p className="mt-[2px] tabular-nums min-[840px]:mt-0 min-[840px]:text-right">
              <span aria-hidden="true" className="flex items-baseline gap-2 min-[840px]:block">
                <b className="block text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.01em] whitespace-nowrap">
                  {targetText(item)}
                </b>
                <i className="text-label leading-4 font-semibold text-tx2 not-italic min-[840px]:mt-[2px] min-[840px]:block">
                  {unitOf(item)}
                </i>
              </span>
              <span className="sr-only">{targetLabel(item)}</span>
            </p>
          </div>
        </div>
        <RungTicks item={item} />
        <div className="col-span-full mt-[var(--sp-3)] min-[840px]:col-span-1 min-[840px]:col-start-2 min-[840px]:row-start-3 min-[840px]:mt-[var(--sp-2)] max-[419px]:mt-[var(--sp-2)] max-[389px]:mt-[var(--sp-1)]">
          {safety === undefined ? null : <SafetyCue text={safety} />}
          <p className="text-body-l leading-[1.47] text-tx">{cue}</p>
        </div>
      </div>
    </article>
  );
}

/** One row of the Then list: a native `details`, so it opens in place with no script. */
export function ThenRow({ item }: { readonly item: PrescribedItem }) {
  const wide = useWide();
  const cardio = item.type === "cardio";
  const postural = item.type === "exercise" && item.ladderKind === "postural";
  const { safety, steps } = wordsOf(item);
  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group">
        <summary className="grid min-h-[56px] cursor-pointer list-none grid-cols-[40px_minmax(0,1fr)_auto_20px] items-center gap-2 px-3 py-2 group-open:bg-s2 min-[840px]:min-h-[60px] min-[840px]:grid-cols-[44px_minmax(0,1fr)_auto_150px] min-[840px]:gap-4 min-[840px]:px-6 max-[419px]:min-h-[52px] max-[389px]:min-h-12 max-[419px]:grid-cols-[32px_minmax(0,1fr)_auto_20px] max-[419px]:px-2 max-[419px]:py-1 max-[389px]:py-0 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-[10px] bg-s2 text-accent group-open:bg-s1 min-[840px]:size-11 max-[419px]:size-8"
          >
            <PatternIcon pattern={cardio ? null : item.pattern} size={wide ? 30 : 26} />
          </span>
          <span className="min-w-0">
            <span className="block text-body leading-[1.35] font-semibold">{itemName(item)}</span>
            <span className="block text-meta leading-[1.33] text-tx2">{metaOf(item)}</span>
          </span>
          <span className="min-w-[60px] text-right tabular-nums max-[389px]:min-w-0">
            <span
              aria-hidden="true"
              className="block text-[1.25rem] leading-tight font-extrabold whitespace-nowrap max-[389px]:text-[1.125rem]"
            >
              {targetText(item)}
            </span>
            <span aria-hidden="true" className="block text-label leading-4 font-semibold text-tx2">
              {unitOf(item)}
            </span>
            <span className="sr-only">{targetLabel(item)}</span>
          </span>
          <span className="flex items-center justify-end gap-2 font-semibold text-accent min-[840px]:text-meta">
            <span className="sr-only min-[840px]:not-sr-only">How to do it</span>
            <ChevronIcon
              size={20}
              className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </summary>
        <div className="bg-s2 pt-3 pb-4 pl-[68px] pr-4 min-[840px]:pr-6 min-[840px]:pl-[84px] max-[419px]:pl-[52px]">
          {safety === undefined ? null : <SafetyCue text={safety} />}
          <ol className="mt-3 grid gap-3 [counter-reset:c] first:mt-0">
            {steps.map((step, index) => (
              <li
                key={index}
                className="relative text-body leading-[1.55] text-tx before:absolute before:top-[2px] before:-left-9 before:grid before:size-6 before:place-items-center before:rounded-full before:bg-s1 before:text-label before:font-bold before:text-tx2 before:content-[counter(c)] [counter-increment:c]"
              >
                {step}
              </li>
            ))}
          </ol>
          {cardio ? <p className="mt-3 text-meta text-tx2">{item.protocol.movements.join("  ·  ")}</p> : null}
        </div>
      </details>
      {postural ? <PosturalNote inset /> : null}
    </li>
  );
}
