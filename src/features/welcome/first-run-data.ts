// What the first run reads and writes, apart from the screen that holds it (app/(app)/welcome/page.tsx in the
// browser, the Android app's welcome screen on a phone): the rows it waits for, how long it waits to learn which
// calendars can be connected, what "That's right" writes, and when the calendar step is settled. Free of the web's
// router and screen parts, so both walk the same steps by the same rules (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { SettingsRepo, WorkHoursRepo } from "@/data/repositories/settings-repo";
import { segmentsLabel, type Segment } from "@/features/settings/settings-rules";
import type { CalendarOutcome } from "./welcome-words";

export const SETTINGS_ROW_SQL = `select id, onboarded_at, timezone from user_settings limit 1`;
export const USER_SQL = `select id, personal_space_id from users limit 1`;
export const CONNECTIONS_SQL = `select count(*) as n from calendar_connections where deleted_at is null`;
/** How long the calendar step waits to learn which calendars this server can connect before it steps aside. */
export const CONFIG_WAIT_MS = 4000;

/** Which calendars this server can connect (api/calendar/config). */
export interface Connectable {
  google: boolean;
  microsoft: boolean;
}
export const NONE: Connectable = { google: false, microsoft: false };

/** The zone the times are in and the week, Monday first: what the hours step confirms. */
export interface HoursChoice {
  zone: string;
  week: readonly (readonly Segment[])[];
}

/**
 * "That's right": the zone and the week as shown, written only where they differ from what is there (`from`). The
 * same call with the two swapped puts both back.
 */
export async function writeHours(
  repos: { settings: Pick<SettingsRepo, "update">; hours: Pick<WorkHoursRepo, "replaceDay"> },
  settingsId: string,
  ctx: { spaceId: string; userId: string },
  to: HoursChoice,
  from: HoursChoice,
): Promise<void> {
  if (to.zone !== from.zone) await repos.settings.update(settingsId, { timezone: to.zone });
  for (let d = 0; d < 7; d++) if (segmentsLabel(to.week[d]) !== segmentsLabel(from.week[d])) await repos.hours.replaceDay(d, to.week[d], ctx);
}

/**
 * The calendar is settled once it is connected (the row has synced, or the consent just said so), the person skipped
 * it (now, or earlier on this device), or this server cannot connect one at all. `can` is null until the server has
 * answered; `outcome` is what the consent came back with.
 */
export function calendarSettled(f: { answered: boolean; connections: number; outcome: string | null; can: Connectable | null }): boolean {
  const connected = f.connections > 0 || f.outcome === "connected";
  return f.answered || connected || f.outcome === "unavailable" || (f.can !== null && !(f.can.google || f.can.microsoft));
}

/** The consent's answer when it was a refusal the step has a line for; null otherwise. */
export function refusalOf(outcome: string | null): CalendarOutcome | null {
  return outcome === "denied" || outcome === "error" || outcome === "no_read" ? outcome : null;
}
