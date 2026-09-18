"use client";
// The top of a view (SCREENS.md §1). On the phone it stacks: the eyebrow
// shares its row with the search and sync icons (there is no sidebar to hold
// them, §20), then the title on its own full-width line, the subtitle, and
// the view's actions on a row of their own. From the narrow band up the
// title block sits left and the actions right.
import type { ReactNode } from "react";
import { usePalette } from "@/features/commands/palette-provider";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { EYEBROW } from "@/ui/section-label";
import { SyncChip } from "./sync-chip";
import { useSyncChip } from "./use-sync-chip";

/** The main column every view renders into: one left edge and one width on every screen (brief D9). */
export const VIEW_COLUMN = "flex w-full max-w-210 flex-col gap-6 px-5 py-6 sm:px-6 md:px-10 md:py-7";

export function ViewHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  /** Plain text becomes the view's `<h1>`; an element (an editable `InlineTitle`) is the heading itself and is placed as it comes. */
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const sync = useSyncChip();
  const palette = usePalette();
  const plain = typeof title === "string" || typeof title === "number";
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-0">
          {eyebrow ? <p className={EYEBROW}>{eyebrow}</p> : <span />}
          <div className="-mr-2 flex items-center sm:hidden">
            <button
              type="button"
              onClick={() => palette.open()}
              aria-label="Search and commands"
              className="flex size-11 items-center justify-center rounded-lg text-ink-2 transition-colors dur-fast hover:bg-hover hover:text-ink active:bg-press"
            >
              <Icon name="search" size={20} />
            </button>
            <SyncChip model={sync} compact placement="below" />
          </div>
        </div>
        {plain ? <h1 className="font-display text-title font-book text-balance text-ink">{title}</h1> : title}
        {subtitle && <p className="mt-1.5 text-body-sm text-pretty text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="-ml-2 flex flex-wrap items-center gap-1 sm:ml-0 sm:shrink-0 sm:pb-1">{actions}</div>}
    </header>
  );
}

/** The one place empty-state copy is styled: the fact, then the next action (SCREENS.md §21). */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <EmptyCard action={action}>{children}</EmptyCard>;
}
