"use client";
// The top command bar of a view (SCREENS.md §1): title and context on the
// left, view actions on the right. On the phone the sync chip lives here,
// because there is no sidebar to hold it (§20).
import type { ReactNode } from "react";
import { SyncChip } from "./sync-chip";
import { useSyncChip } from "./use-sync-chip";

export function ViewHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  const sync = useSyncChip();
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{eyebrow}</p>}
        <h1 className="font-display text-3xl leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <SyncChip model={sync} compact className="sm:hidden" />
      </div>
    </header>
  );
}

/** The one place empty-state copy is styled: the fact, then the next action (SCREENS.md §21). */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-4 py-6 text-[15px] text-ink-2">
      <p>{children}</p>
      {action}
    </div>
  );
}
