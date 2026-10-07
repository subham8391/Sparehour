"use client";
// "Not yet planned" (SCREENS.md §3): active tasks with no day yet. In the
// wide band it is the planner's last column — compact rows to drag onto a
// day, and a drop target that takes a day away. In the narrow and medium
// bands it is a "Not yet planned · N" button, and on the phone a strip pinned
// above the tab bar, that opens the same list as a sheet with a day picker
// per task (unplanned-sheet.tsx, lazy).
import type { ReactNode, RefObject } from "react";
import { DropZone } from "@/features/tasks/drop-zone";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";
import { cx } from "@/ui/cx";

export const RAIL_ID = "not-yet-planned";

export function RailColumn({
  count,
  synced,
  onDropTask,
  railRef,
  children,
}: {
  count: number;
  synced: boolean;
  onDropTask: (sourceId: string) => void;
  /** "Plan your week" scrolls here and focuses it. */
  railRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <DropZone label="Not yet planned" onDropTask={onDropTask} className="h-full">
      <section ref={railRef} id={RAIL_ID} tabIndex={-1} aria-labelledby={`${RAIL_ID}-label`} className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-dashed border-line-strong p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        <header className="flex flex-col gap-0.5 px-0.5">
          <h2 id={`${RAIL_ID}-label`} className={EYEBROW}>
            Not yet planned
            {count > 0 && <b className="ml-1.5 font-semibold tracking-normal text-ink-2 num">{count}</b>}
          </h2>
          {count > 0 && <p className="text-label text-ink-3">Drag onto a day</p>}
        </header>
        {count === 0 ? synced && <p className="px-0.5 text-body-sm text-ink-3">Every task has a day.</p> : <ul className="flex flex-col gap-1.5">{children}</ul>}
      </section>
    </DropZone>
  );
}

/** The rail folded into a button below the wide band. */
export function UnplannedButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Button variant="secondary" onClick={onOpen} aria-haspopup="dialog" className={cx(count === 0 && "text-ink-2")}>
      Not yet planned
      <span className="text-ink-2 num">· {count}</span>
    </Button>
  );
}

/**
 * The phone's way in (SCREENS.md §3, DECISIONS.md "Not yet planned on the phone"): a strip pinned at the bottom,
 * above the tab bar and clear of the FAB, the safe area respected, reading "Not yet planned · 5". It opens the sheet
 * where each task gets a day picker.
 */
export function UnplannedStrip({ count, onOpen, className }: { count: number; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cx(
        // Tab bar 56 px + 8 px; the FAB sits to the right (20 px in, 56 px wide), so the strip stops 96 px from the edge.
        "fixed right-24 bottom-[calc(4rem+env(safe-area-inset-bottom))] left-4 z-20 flex h-12 items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/95 px-4 text-left text-body font-medium text-ink shadow-raised backdrop-blur-md transition-transform dur-fast motion-safe:active:scale-97",
        className,
      )}
    >
      <span className="min-w-0 truncate">
        Not yet planned <span className="text-ink-2 num">· {count}</span>
      </span>
      <Icon name="chevron-right" size={16} className="ml-auto shrink-0 text-ink-3" />
    </button>
  );
}
