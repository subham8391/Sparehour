// The calendar's words on Today (SCREENS.md §2.7, §21; PRODUCT_SPEC.md §10.3 rule 5), out of the shell: only the
// islands that show them — the banner and the day pane — import this.
import type { CalendarIssue, CalendarWrites } from "./hooks/use-today";

/** The banner's first line for an issue. */
export function issueMessage(issue: Pick<CalendarIssue, "kind" | "email" | "lastSyncedAt">): string {
  if (issue.kind === "reauth") return `Google Calendar${issue.email ? ` (${issue.email})` : ""} needs reconnecting.`;
  if (issue.kind === "write_gone") return "The calendar your blocks went to is no longer in Google Calendar.";
  return issue.lastSyncedAt
    ? `Couldn't reach Google Calendar. Showing your last sync from ${new Date(issue.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : "Couldn't reach Google Calendar yet.";
}

/** Why blocking is paused, where a block would have been dropped (the day pane), in plain words. */
export function pausedLine(off: CalendarWrites["off"]): string | null {
  if (off === "reauth") return "Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced.";
  if (off === "write_gone") return "Blocking is paused until you choose where blocks go. Your blocks stay here, not synced.";
  return null;
}
