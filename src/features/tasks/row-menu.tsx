"use client";
// The row ⋯ menu's own group (PRODUCT_SPEC.md §8.6, SCREENS.md §3, §24): under
// the row's actions, the snooze presets — This evening · Tomorrow · In 4 hours
// · This weekend · Next week — and Move to…, the day picker with Pick a date.
// Each preset is the palette's write (applySnooze), with its undo toast. A
// row action that says the same as a preset ("Tomorrow") steps aside in the
// menu, so nothing is listed twice; the hover zone keeps it. Lazy: loaded in
// idle time and drawn when a menu opens (row-islands.tsx).
import type { ReactNode } from "react";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { MENU_SEPARATOR } from "@/ui/popover";
import { PRESET_LABELS, applySnooze, snoozePresets } from "./snooze";
import { OwnedLabels, RowAction, useRowActions } from "./task-actions";
import { useTaskRepo } from "./use-task-repo";

export function RowMenu({ taskId, children }: { taskId: string; children: ReactNode }) {
  const repo = useTaskRepo();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const { move } = useRowActions();
  return (
    <>
      <OwnedLabels labels={PRESET_LABELS}>{children}</OwnedLabels>
      {/* No line above the group when the row's own actions all stepped aside. */}
      <div role="separator" className={`${MENU_SEPARATOR} first:hidden`} />
      {snoozePresets(now, zone, today).map((p) => (
        <RowAction key={p.id} label={p.label} onClick={() => void applySnooze(repo, [taskId], p)} />
      ))}
      {move && <RowAction label="Move to…" onClick={() => move(null)} />}
    </>
  );
}
