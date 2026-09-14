// What a dragged task row carries to the timeline (SCREENS.md §2.6). Type
// aliases, not interfaces, so they satisfy the drag library's open record.
export type TaskDragData = {
  type: "task";
  id: string;
  title: string;
  estimateMin: number | null;
};

export type BlockDragData = {
  type: "block";
  id: string;
  /** Minutes long, so the ghost keeps the block's size. */
  duration: number;
  /** Pointer offset from the block's top when the drag started, in px. */
  grabPx: number;
};

export type DragData = TaskDragData | BlockDragData;

export function asDragData(data: Record<string, unknown>): DragData | null {
  if (data.type === "task" || data.type === "block") return data as unknown as DragData;
  return null;
}
