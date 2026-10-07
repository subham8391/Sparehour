"use client";
// This Evening (SCREENS.md §2.5, §2.8): same rows as Today, its own readout ("THIS EVENING · 2 · 40m") and its own,
// quieter overload line, "That's a full evening." On a phone it is a disclosure that starts collapsed to its label,
// count and minutes, remembered open or shut on the device, and tells the page when it is shut so J/K step over it.
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
import { eveningBudget } from "@/core/capacity/evening";
import type { Interval } from "@/core/capacity/intervals";
import { formatMinutes, type LocalTime } from "@/core/time";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { cx } from "@/ui/cx";
import { SectionLabel } from "@/ui/section-label";
import { usePhone } from "@/ui/use-phone";

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

// On a phone This Evening starts collapsed (SCREENS.md §2.8); opening or closing it is remembered on the device.
const OPEN_KEY = "sparehour:evening-open";
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export interface EveningSectionProps {
  count: number;
  /** What the evening tasks add up to, at their estimates. */
  plannedMin: number;
  /** The day's work windows (Capacity.windows) and the evening's two settings, for its budget. */
  windows: readonly Interval[];
  eveningStartsAt: LocalTime;
  eveningEndsAt: LocalTime;
  /** The task list, when there are rows. */
  rows: ReactNode;
  /** While a row is dragged and can land here: what dropping it does. */
  onDrop: ((taskId: string) => void) | null;
  /** Collapsed on a phone: Today's J/K step over the rows they cannot see. */
  onShutChange: (shut: boolean) => void;
}

export function EveningSection({ count, plannedMin, windows, eveningStartsAt, eveningEndsAt, rows, onDrop, onShutChange }: EveningSectionProps) {
  const phone = usePhone();
  const [open, setOpen] = useState(readOpen);
  const shut = phone && count > 0 && !open;
  useEffect(() => onShutChange(shut), [shut, onShutChange]);
  useEffect(() => () => onShutChange(false), [onShutChange]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable: it holds for this visit only
    }
  };
  const minutes = formatMinutes(plannedMin);
  // More planned than the evening has time for (PRODUCT_SPEC.md §9.1): one quiet line, never the over colour.
  const full = count > 0 && eveningBudget({ windows, eveningStartsAt, eveningEndsAt, plannedMin }).full;
  const fullLine = full && <p className="px-0.5 text-body-sm text-ink-2">That&rsquo;s a full evening.</p>;
  return (
    <section className="flex flex-col gap-2">
      {phone && count > 0 ? (
        <>
          <CollapsedGroup className="px-0.5" label="This evening" count={count} note={minutes} open={open} onToggle={toggle}>
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
          {onDrop && <SectionDrop label="Drop here for this evening" onDrop={onDrop} />}
        </>
      )}
    </section>
  );
}
