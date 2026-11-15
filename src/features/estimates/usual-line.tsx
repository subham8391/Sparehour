// "Tasks like this usually take you 50m." with the one tap that takes it (DECISIONS.md, amendment 2026-11-15): what
// the person's finished tasks say about an estimate, where one is being chosen: quick add's strip and the task
// detail. A suggestion, never a change on its own; ink, not a warning.
import { formatMinutes } from "@/core/time";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

export function UsualLine({
  minutes,
  onUse,
  about = "Tasks like this usually take you",
  inline = false,
  className,
}: {
  minutes: number;
  onUse: () => void;
  /** The sentence up to the length: Settings says it of tasks with no estimate. */
  about?: string;
  /**
   * A line of its own inside a paragraph that is already there (quick add's strip, which is read out as it changes):
   * the action follows the words. Elsewhere it is a row of a list of fields, with the action at the far edge.
   */
  inline?: boolean;
  className?: string;
}) {
  const Line = inline ? "span" : "p";
  return (
    <Line data-usual={minutes} className={cx("flex flex-wrap items-center gap-x-1.5 text-body-sm text-pretty text-ink-2", inline && "basis-full", className)}>
      <span className={inline ? undefined : "mr-auto"}>
        {about} {formatMinutes(minutes)}.
      </span>
      <Button variant="link" size="compact" className="font-medium" onClick={onUse}>
        Use {formatMinutes(minutes)}
      </Button>
    </Line>
  );
}
