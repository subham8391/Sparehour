"use client";
// Settings › Notifications' "Held back now: …" (docs/product/REMINDERS_AND_AI_SPEC.md §1), read from the device: the
// coming week's blocks, asked of the rule with the values Settings is showing. Those are the settings row with a
// change just made laid over it (settings-values.ts), so the line follows the two times as they are edited. Free of
// the web's screen parts: the web's section and the Android app's read it the same way.
import { useQuery } from "@/data/powersync";
import { COMING_BLOCKS_SQL, comingBlocksParams, type ComingBlockRow } from "@/data/queries/blocks";
import type { SettingsValues } from "@/features/settings/settings-values";
import { useNow } from "@/features/shell/use-local-day";
import { HELD_DAYS, heldLine, reminderSettingsOf, type ReminderValues } from "./held-reminders";

export function useHeldLine(values: ReminderValues & Pick<SettingsValues, "timezone">): string | null {
  // Once a minute: a block that starts leaves the line on its own.
  const now = useNow();
  const { data } = useQuery<ComingBlockRow>(COMING_BLOCKS_SQL, comingBlocksParams(now, HELD_DAYS));
  return heldLine(data ?? [], now, values.timezone, reminderSettingsOf(values));
}
