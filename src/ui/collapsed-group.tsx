"use client";
// A collapsed group under a list (SCREENS.md §6 "Starting later · 4", §8 the
// Logbook's "Dropped", the finished projects on Browse and an area): a
// native disclosure whose summary reads like a section label — the eyebrow,
// the count in ink-2, an optional quiet note — with a 44 px target on the
// phone. Closed until the person opens it, or held by `open` when the view
// remembers it (Today's This Evening on a phone); `onToggle` tells a view
// when the rows inside become visible (so J/K only walks rows that can be seen).
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { EYEBROW } from "./section-label";

export function CollapsedGroup({
  label,
  count,
  note,
  open,
  onToggle,
  className,
  children,
}: {
  label: string;
  count: number;
  /** Quiet words after the count: "done, dropped or not started yet". */
  note?: string;
  /** Held open or closed by the view; left out, the disclosure keeps its own state and starts closed. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={open} className={cx("group/collapsed", className)} onToggle={(e) => onToggle?.(e.currentTarget.open)}>
      <summary className={cx(EYEBROW, "-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-2 transition-colors dur-fast hover:bg-hover sm:min-h-7 touch:min-h-11 [&::-webkit-details-marker]:hidden")}>
        {/* The turn is the disclosure's state, not decoration, so only the transition is gated on motion. */}
        <Icon name="chevron-right" size={14} className="shrink-0 text-ink-3 group-open/collapsed:rotate-90 motion-safe:transition-transform motion-safe:dur-fast" />
        {label}
        <span className="font-medium normal-case tracking-normal num">
          <b className="font-semibold text-ink-2">{count}</b>
          {note && <span className="text-ink-3"> · {note}</span>}
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
