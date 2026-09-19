"use client";
// A region a task row can be dropped on — a day in Upcoming, the "Not yet
// planned" rail — drawn with a ring while a row is over it. Rows inside it
// are drop targets of their own; the zone only acts when nothing nearer
// took the drop.
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function DropZone({ onDropTask, children, className = "", label }: { onDropTask: (sourceId: string) => void; children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const dropRef = useRef(onDropTask);
  useEffect(() => {
    dropRef.current = onDropTask;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source, location }) => {
        setOver(false);
        if (location.current.dropTargets[0]?.element !== el) return;
        dropRef.current(String(source.data.id));
      },
    });
  }, []);
  return (
    // The outline stands off the card rather than hugging it, so a row hovering over a list is not mistaken for a focus ring on the card.
    <div ref={ref} role="group" aria-label={label} data-over={over || undefined} className={`rounded-xl ${over ? "outline-2 outline-offset-4 outline-ink" : ""} ${className}`}>
      {children}
    </div>
  );
}
