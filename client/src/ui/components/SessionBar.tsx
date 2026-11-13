import { QuietButton } from "./Buttons.tsx";
import { ExitIcon } from "./icons.tsx";

/**
 * The slim bar over a session: which day, which exercise of how many, and the one
 * way out. A session is a mode and not a destination, so there is no tab bar or top
 * bar under it, and the way out is a single quiet control at the right end, away
 * from the thumb that is about to press Next.
 */
export function SessionBar({
  label,
  number,
  count,
  onStop,
}: {
  readonly label: string;
  readonly number: number;
  readonly count: number;
  readonly onStop: () => void;
}) {
  return (
    <header className="pad-top-safe shrink-0 border-b border-line2 bg-s1">
      <div className="mx-auto grid min-h-14 w-full max-w-[1168px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--sp-4)] pr-[var(--sp-4)] pl-[var(--sp-4)] min-[840px]:min-h-16 min-[840px]:px-6">
        <p className="flex gap-[var(--sp-3)] text-meta font-semibold text-tx2 tabular-nums min-[840px]:text-body">
          <span>{label}</span>
          <span className="text-tx">{`${number} of ${count}`}</span>
        </p>
        <div role="img" aria-label={`Exercise ${number} of ${count}`} className="flex max-w-40 gap-[var(--sp-1)]">
          {Array.from({ length: count }, (_, index) => (
            <i
              key={index}
              className={`block h-[6px] flex-1 rounded-[3px] ${index === number - 1 ? "bg-accent" : "bg-line2"}`}
            />
          ))}
        </div>
        <QuietButton onClick={onStop} aria-label="Stop this session. Nothing is recorded.">
          <ExitIcon size={20} />
          Stop
        </QuietButton>
      </div>
    </header>
  );
}
