"use client";
// This Evening (SCREENS.md §2.5, §2.8): same rows as Today, its own readout ("THIS EVENING · 2 · 40m") and its own,
// quieter overload line, "That's a full evening." On a phone it is a disclosure that starts collapsed to its label,
// count and minutes; the page holds whether it is open (remembered on the device) so J/K can step over it.
//
// And the place to drop a dragged row on a section with no row to land beside — an empty This Evening, an empty
// Today, or either while a sort holds the rows still. Dropping on This Evening sets the evening flag, on Today
// clears it; the row's own move (`placeInDay`) is the undo. The phone has no drag: the detail's Do field (This
// evening) is its tap path, Shift+E the keyboard's.
//
// An island out of Today's first download (SYSTEM_DESIGN.md §11.6), fetched as the page mounts, like the day pane,
// so it is in memory before the local database has the rows.
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { cx } from "@/ui/cx";
import { SectionLabel } from "@/ui/section-label";

export function SectionDrop({ label, onDrop }: { label: string; onDrop: (taskId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        dropRef.current(String(source.data.id));
      },
    });
  }, []);
  return (
    <div
      ref={ref}
      data-testid="section-drop"
      className={cx("flex min-h-11 items-center justify-center rounded-xl border border-dashed px-4 text-body-sm transition-colors dur-fast", over ? "border-ink bg-hover text-ink" : "border-line-control text-ink-3")}
    >
      {label}
    </div>
  );
}

export interface EveningSectionProps {
  count: number;
  /** The evening tasks' planned total, "40m". */
  minutes: string;
  /** Planned past the evening's budget. */
  full: boolean;
  /** The phone: a disclosure, held open or shut by the page. */
  collapsible: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The task list, when there are rows. */
  rows: ReactNode;
  /** While a row is dragged and can land here: the drop place. */
  onDrop: ((taskId: string) => void) | null;
}

export function EveningSection({ count, minutes, full, collapsible, open, onToggle, rows, onDrop }: EveningSectionProps) {
  const fullLine = full && count > 0 && <p className="px-0.5 text-body-sm text-ink-2">That&rsquo;s a full evening.</p>;
  const drop = onDrop && <SectionDrop label="Drop here for this evening" onDrop={onDrop} />;
  return (
    <section className="flex flex-col gap-2">
      {collapsible && count > 0 ? (
        <>
          <CollapsedGroup className="px-0.5" label="This evening" count={count} note={minutes} open={open} onToggle={onToggle}>
            {rows}
          </CollapsedGroup>
          {fullLine}
        </>
      ) : (
        <>
          <SectionLabel className="px-0.5" count={count || undefined} detail={count > 0 && minutes}>
            This evening
          </SectionLabel>
          {fullLine}
          {count > 0 && rows}
          {drop}
        </>
      )}
    </section>
  );
}
