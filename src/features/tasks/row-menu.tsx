"use client";
// The row ⋯ menu's own group (PRODUCT_SPEC.md §8.6, SCREENS.md §3, §24): under
// the row's actions, the snooze presets — This evening · Tomorrow · In 4 hours
// · This weekend · Next week — and Move to…, the day picker with Pick a date.
// Each preset is the palette's write (applySnooze), with its undo toast. A
// row action that says the same as a preset ("Tomorrow") steps aside in the
// menu, so nothing is listed twice; the hover zone keeps it. A view's `lead`
// (the Inbox's Today · Tomorrow · Someday · Project…, SCREENS.md §5) heads the
// menu instead, and a preset or row action of the same name steps aside for
// it. Lazy: loaded in idle time and drawn when a menu opens (row-islands.tsx).
import { Children, isValidElement, type ReactNode } from "react";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { MENU_SEPARATOR } from "@/ui/popover";
import { PRESET_LABELS, applySnooze, snoozePresets } from "./snooze";
import { OwnedLabels, RowAction, useRowActions } from "./task-actions";
import { useTaskRepo } from "./use-task-repo";

/** The labels of the lead's actions: its direct `RowAction`s (or anything with a string `label`). */
export function leadLabels(lead: ReactNode): Set<string> {
  const out = new Set<string>();
  Children.forEach(lead, (child) => {
    if (isValidElement<{ label?: unknown }>(child) && typeof child.props.label === "string") out.add(child.props.label);
  });
  return out;
}

export function RowMenu({ taskId, lead, children }: { taskId: string; lead?: ReactNode; children: ReactNode }) {
  const repo = useTaskRepo();
  const now = useNow();
  // The presets are the account's day and zone: they wait for its settings row, read as the menu opens, so a quick
  // choice never lands in UTC ("In 4 hours" an hour out in London's summer).
  const { today, zone, ready } = useLocalDay(now);
  const { move } = useRowActions();
  const led = leadLabels(lead);
  return (
    <>
      {lead}
      <OwnedLabels labels={led.size > 0 ? new Set([...PRESET_LABELS, ...led]) : PRESET_LABELS}>{children}</OwnedLabels>
      {/* No line above the group when the row's own actions all stepped aside. */}
      <div role="separator" className={`${MENU_SEPARATOR} first:hidden`} />
      {ready &&
        snoozePresets(now, zone, today)
          .filter((p) => !led.has(p.label))
          .map((p) => <RowAction key={p.id} label={p.label} onClick={() => void applySnooze(repo, [taskId], p)} />)}
      {move && <RowAction label="Move to…" onClick={() => move(null)} />}
    </>
  );
}
