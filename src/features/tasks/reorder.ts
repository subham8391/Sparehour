// Drag-to-reorder within a list (SCREENS.md §2.4, §9): which edge of a row
// the pointer is over, where the dragged row lands, and the one key that
// write needs (SYSTEM_DESIGN.md §5.6). Pure.
import { keyBetween } from "@/core/ordering";

export type Edge = "top" | "bottom";

/** Above or below the row's midline. */
export function edgeFor(clientY: number, rect: { top: number; height: number }): Edge {
  return clientY < rect.top + rect.height / 2 ? "top" : "bottom";
}

export interface Keyed {
  id: string;
  key: string | null;
}

export interface Drop {
  /** Position in the list once the dragged row is out of it. */
  index: number;
  /** The sort key that puts it there. */
  key: string;
}

/**
 * Where a row dropped on `targetId`'s top or bottom edge lands in `list`
 * (display order), and the key for it. Null when it would not move. A row
 * from another list (another day, another heading) is simply inserted.
 */
export function planDrop(list: readonly Keyed[], sourceId: string, targetId: string, edge: Edge): Drop | null {
  const rest = list.filter((x) => x.id !== sourceId);
  const t = rest.findIndex((x) => x.id === targetId);
  if (t === -1) return null;
  const index = edge === "top" ? t : t + 1;
  const from = list.findIndex((x) => x.id === sourceId);
  if (from !== -1 && from === index) return null;
  return { index, key: keyBetween(rest[index - 1]?.key ?? null, rest[index]?.key ?? null) };
}
