"use client";
// "Not yet planned" (SCREENS.md §3): active tasks with no day yet. In the
// wide band it is the planner's last column — compact rows to drag onto a
// day, and a drop target that takes a day away. In the narrow and medium
// bands it is a "Not yet planned · N" button that opens the same list as a
// sheet, where a task goes to Today or Tomorrow at a tap, or opens to be
// given any day (a day picker per task comes with the phone's strip).
import type { ReactNode, RefObject } from "react";
import { DropZone } from "@/features/tasks/drop-zone";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
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

/** The rail as a sheet: the same tasks as full rows, each with its moves. */
export function UnplannedSheet({ count, onClose, children }: { count: number; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet label="Not yet planned" onClose={onClose} width="lg" className="max-h-[calc(100dvh-5rem)] sm:max-h-[80dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="font-display text-pane font-medium text-ink">
          Not yet planned <span className="text-ink-3 num">· {count}</span>
        </h2>
        <Button variant="icon" onClick={onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {count === 0 ? <p className="px-2 pb-2 text-body text-ink-2">Every task has a day.</p> : <p className="px-2 pb-2 text-body-sm text-ink-2">Send a task to Today or Tomorrow, or open it to give it any day.</p>}
        {children}
      </div>
    </Sheet>
  );
}
