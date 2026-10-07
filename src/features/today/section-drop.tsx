"use client";
// Dropping a row on a Today section that has no row to drop beside (SCREENS.md §2.5): while a task row is
// dragged, an empty This Evening — or Today, or either one while a sort holds the rows still — shows a dashed
// place to drop it. Dropping on This Evening sets the evening flag, on Today clears it; the row's own move
// (`placeInDay`) is the undo. The phone has no drag: the detail's Do field (This evening) is its tap path, Shift+E the keyboard's.
import { dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/ui/cx";

/** The id of the task row being dragged anywhere on the page, or null. */
export function useTaskDrag(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === "task",
        onDragStart: ({ source }) => setId(String(source.data.id)),
        onDrop: () => setId(null),
      }),
    [],
  );
  return id;
}

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
