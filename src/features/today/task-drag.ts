"use client";
// Whether a task row is being dragged anywhere on the page (SCREENS.md §2.5): Today shows a place to drop it on a
// section with no row to land beside. The drop target itself lives in the evening-section island.
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useState } from "react";

/** The id of the task row being dragged, or null. */
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
