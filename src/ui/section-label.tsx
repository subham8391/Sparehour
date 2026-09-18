// The eyebrow that heads a list section: "TODAY 4 · 3h", "CARRIED OVER 2".
// Tracked uppercase in ink-3 with a tabular count in ink-2 and an optional
// text action on the right ("Clear the slate").
import type { ReactNode } from "react";
import { cx } from "./cx";

export const EYEBROW = "text-label font-semibold uppercase tracking-eyebrow text-ink-3";

export function SectionLabel({
  children,
  count,
  detail,
  action,
  as: Tag = "h2",
  className,
}: {
  children: ReactNode;
  /** The tabular count after the label. */
  count?: number | string;
  /** What follows the count after a dot: "3h", "Clear the slate". */
  detail?: ReactNode;
  /** A text button on the right; stays baseline-aligned with the label. */
  action?: ReactNode;
  as?: "h2" | "h3" | "p" | "div";
  className?: string;
}) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3", className)}>
      <Tag className={EYEBROW}>
        {children}
        {(count !== undefined || detail) && (
          <span className="ml-2 font-medium normal-case tracking-normal num">
            {count !== undefined && <b className="font-semibold text-ink-2">{count}</b>}
            {count !== undefined && detail && " · "}
            {detail}
          </span>
        )}
      </Tag>
      {action}
    </div>
  );
}
