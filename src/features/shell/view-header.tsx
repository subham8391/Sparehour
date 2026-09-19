"use client";
// The top of a view (SCREENS.md §1). Two columns: the title block and, beside
// it, the view's controls. On the phone the controls share the eyebrow's row —
// search, and whatever the view puts in `compactActions` — so a lone icon
// never gets a row of its own; from the narrow band up the same cluster drops
// to the bottom of the right column and search goes back to the sidebar. The
// compact sync cloud is not here at all: on a phone sync lives on the Browse
// tab (ruling R4).
import type { ReactNode } from "react";
import { usePalette } from "@/features/commands/palette-provider";
import { cx } from "@/ui/cx";
import { iconButtonClass } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { EYEBROW } from "@/ui/section-label";

/** The main column every view renders into: one left edge and one width on every screen (brief D9). */
export const VIEW_COLUMN = "flex w-full max-w-210 flex-col gap-6 px-5 py-6 sm:px-6 md:px-10 md:py-7";

export function ViewHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  compactActions,
}: {
  eyebrow?: ReactNode;
  /** Plain text becomes the view's `<h1>`; an element (an editable `InlineTitle`) is the heading itself and is placed as it comes. */
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Controls that belong beside the eyebrow on a phone — a `⋯` menu, one icon — and with the actions above it. */
  compactActions?: ReactNode;
}) {
  const palette = usePalette();
  const plain = typeof title === "string" || typeof title === "number";
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 sm:gap-x-4">
      {eyebrow ? <p className={cx(EYEBROW, "col-start-1 row-start-1 self-center sm:pb-2")}>{eyebrow}</p> : <span className="col-start-1 row-start-1" />}
      {/* Row 1 on a phone, the full height of the right column from `sm` up, where it settles on the baseline of the title. */}
      <div className="col-start-2 row-start-1 -mr-2 flex min-h-11 flex-wrap items-center justify-end gap-1 sm:row-span-3 sm:mr-0 sm:min-h-0 sm:self-end sm:pb-1">
        {actions}
        {compactActions}
        <button type="button" onClick={() => palette.open()} aria-label="Search and commands" className={cx(iconButtonClass({ size: "touch" }), "sm:hidden")}>
          <Icon name="search" size={18} />
        </button>
      </div>
      <div className="col-start-1 row-start-2 min-w-0">{plain ? <h1 className="font-display text-title font-book text-balance text-ink">{title}</h1> : title}</div>
      {subtitle && <p className="col-start-1 row-start-3 mt-1.5 text-body-sm text-pretty text-ink-2">{subtitle}</p>}
    </header>
  );
}

/** The one place empty-state copy is styled: the fact, then the next action (SCREENS.md §21). */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <EmptyCard action={action}>{children}</EmptyCard>;
}
