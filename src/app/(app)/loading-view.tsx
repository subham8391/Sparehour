// One treatment for a view that is still opening. Nothing here moves
// (DESIGN_SYSTEM.md §7: skeletons and progress are static), and the line sits
// on the column's own left edge, so the page does not jump when the data
// lands. Every route that waits on the local database uses this one shape.
import type { ReactNode } from "react";
import { VIEW_COLUMN } from "@/features/shell/view-header";
import { cx } from "@/ui/cx";

/** The quiet line itself, for a view that is already inside its own `main`. */
export const LOADING_LINE = "text-body text-ink-3";

export function Loading({ children = "Opening…" }: { children?: ReactNode }) {
  return <main className={cx(VIEW_COLUMN, LOADING_LINE)}>{children}</main>;
}
