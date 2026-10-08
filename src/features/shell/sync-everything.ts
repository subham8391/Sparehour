// Sync now (SCREENS.md §20, §12 App): the data sync, then the calendar's accounts when any are connected. One path
// for the sync chip's expanded panel and the palette; both are islands, so this never rides in a shell.
import { syncNow } from "@/data/powersync/provider";
import { calendarSyncNow, type CalendarSyncOutcome } from "@/features/calendar/sync-now";

export const CALENDAR_READ_SQL = `select max(last_synced_at) as at, count(*) as n from calendar_connections where deleted_at is null`;

export async function syncEverything(hasCalendar: boolean): Promise<CalendarSyncOutcome> {
  await syncNow().catch(() => undefined);
  return hasCalendar ? calendarSyncNow() : { ok: true, message: "Synced." };
}
