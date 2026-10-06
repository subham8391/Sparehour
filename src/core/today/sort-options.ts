// Today's Sort choices (SCREENS.md §2.4 "Order"), on their own: the settings
// row, the palette and Settings need the names, and only Today needs the
// comparators in ./sort, so every other shell stays without them.

export type TodaySort = "manual" | "time" | "priority" | "deadline" | "estimate";

export const TODAY_SORTS: readonly { value: TodaySort; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "time", label: "Time" },
  { value: "priority", label: "Priority" },
  { value: "deadline", label: "Deadline" },
  { value: "estimate", label: "Estimate" },
];

export const isTodaySort = (v: unknown): v is TodaySort => TODAY_SORTS.some((s) => s.value === v);
