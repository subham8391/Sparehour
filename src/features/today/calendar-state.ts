"use client";
// What Today says about the calendar (SCREENS.md §2.7, §21; PRODUCT_SPEC.md §10.3 rule 5): the one issue that needs
// attention, whether blocks reach Google, and whether blocking is paused — with the words for each. Read by the
// islands that show them (the banner, the day pane) and the morning plan, never by Today's shell.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";

export interface CalendarIssue {
  /** reauth: access lapsed or revoked; write_gone: the calendar blocks went to left Google; error: a sync failed. */
  kind: "reauth" | "write_gone" | "error";
  /** The account's address, and its last good sync, for the banner's words. */
  email: string | null;
  lastSyncedAt: string | null;
  /** The account, and the moment the issue began, so a dismissal for the session is of this issue only. */
  key: string;
  /** Blocking is paused until it is fixed (PRODUCT_SPEC.md §10.3 rule 5); an unreachable calendar never pauses it. */
  blocking: boolean;
}

/** Whether new blocks can reach Google, and why blocking is paused when it cannot. */
export interface CalendarWrites {
  /** A write calendar is set and its account may write: a block's pending push_state means it will sync. */
  on: boolean;
  /** Blocking is paused, and why (`pausedLine` says it); null while blocking works. */
  off: "reauth" | "write_gone" | null;
}

type CalendarLink = Pick<CalendarFullRow, "calendar_account_id" | "write_target">;

/** The account behind the write calendar, when there is one. */
const writeAccount = (calendars: readonly CalendarLink[]) => calendars.find((c) => c.write_target === 1)?.calendar_account_id ?? null;
const lapsed = (r: CalendarConnectionRow) => r.status === "needs_reauth" || r.status === "revoked";

/**
 * The first thing about the calendar that needs attention: lapsed access first, then a write calendar that left
 * Google, then a sync that failed (its events are still the last good ones). Lapsed access pauses blocking when it
 * is the write calendar's account; a lost write calendar always does.
 */
export function calendarIssueFrom(rows: readonly CalendarConnectionRow[], calendars: readonly CalendarLink[] = []): CalendarIssue | null {
  const writer = writeAccount(calendars);
  const issue = (kind: CalendarIssue["kind"], r: CalendarConnectionRow, key: string, blocking: boolean): CalendarIssue => ({ kind, email: r.email, lastSyncedAt: r.last_synced_at, key: `${kind}:${r.id}:${key}`, blocking });
  const reauth = rows.find((r) => lapsed(r) && r.id === writer) ?? rows.find(lapsed);
  if (reauth) return issue("reauth", reauth, "", reauth.id === writer);
  const gone = writer === null ? rows.find((r) => r.write_lost_at) : undefined;
  if (gone) return issue("write_gone", gone, gone.write_lost_at ?? "", true);
  const failed = rows.find((r) => r.last_error);
  return failed ? issue("error", failed, failed.last_synced_at ?? "", false) : null;
}

/** Whether blocks reach Google now, and why blocking is paused when the issue pauses it. */
export function calendarWrites(rows: readonly CalendarConnectionRow[], calendars: readonly CalendarLink[]): CalendarWrites {
  const issue = calendarIssueFrom(rows, calendars);
  const writer = writeAccount(calendars);
  const account = writer ? rows.find((r) => r.id === writer) : undefined;
  return {
    on: Boolean(account && account.can_write === 1 && !lapsed(account)),
    off: issue?.blocking ? (issue.kind as "reauth" | "write_gone") : null,
  };
}

/** The banner's first line for an issue. */
export function issueMessage(issue: Pick<CalendarIssue, "kind" | "email" | "lastSyncedAt">): string {
  if (issue.kind === "reauth") return `Google Calendar${issue.email ? ` (${issue.email})` : ""} needs reconnecting.`;
  if (issue.kind === "write_gone") return "The calendar your blocks went to is no longer in Google Calendar.";
  return issue.lastSyncedAt
    ? `Couldn't reach Google Calendar. Showing your last sync from ${new Date(issue.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : "Couldn't reach Google Calendar yet.";
}

/** Why blocking is paused, where a block would have been placed (the day pane), in plain words. */
export function pausedLine(off: CalendarWrites["off"]): string | null {
  if (off === "reauth") return "Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced.";
  if (off === "write_gone") return "Blocking is paused until you choose where blocks go. Your blocks stay here, not synced.";
  return null;
}

/** The calendar's issue and writes, from the local mirror of the accounts and calendars. */
export function useCalendarState(): { issue: CalendarIssue | null; writes: CalendarWrites } {
  const { data: connections } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const { data: calendars } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  return useMemo(() => ({ issue: calendarIssueFrom(connections ?? [], calendars ?? []), writes: calendarWrites(connections ?? [], calendars ?? []) }), [connections, calendars]);
}
