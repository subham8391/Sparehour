// The card that wraps a list (DESIGN_SYSTEM.md §4): surface, a hairline, 12 px
// corners, no shadow. Rows inside separate themselves with a top hairline.
// `EmptyCard` is the empty state: no dashed box, a serif fact line, one
// sentence, a text action.
import type { ReactNode } from "react";
import { cx } from "./cx";

export const CARD = "rounded-xl border border-line bg-surface";

export function ListCard({ as: Tag = "ul", className, children, ...rest }: { as?: "ul" | "ol" | "div" | "section"; className?: string; children: ReactNode; "aria-label"?: string }) {
  return (
    <Tag className={cx(CARD, className)} {...rest}>
      {children}
    </Tag>
  );
}

export function EmptyCard({ fact, children, action, className }: { /** The serif line: "That's the day. Nothing is waiting for you." */ fact?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-start gap-3 py-2", className)}>
      {fact && <p className="font-display text-pane font-medium text-ink">{fact}</p>}
      {children && <p className="text-body-lg text-ink-2">{children}</p>}
      {action && <div className="-ml-2 flex flex-wrap items-center gap-1">{action}</div>}
    </div>
  );
}
