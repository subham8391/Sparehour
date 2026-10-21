// Which calendars can take blocks (DECISIONS.md, amendment 2026-10-21): any calendar the person can write when the
// account may write to their own calendars (full access), and otherwise only the "Sparehour" calendar the app made.
// Shared by Settings › Calendar and Today's write-calendar picker; plain data in, so neither pulls the other in.

/** The calendar Sparehour creates for the blocks (server/calendar/account-sync.ts names it). */
export const APP_CALENDAR = "Sparehour";

export interface BlockCalendar {
  accountId: string | null;
  summary: string | null;
  /** Google's role: owner | writer | reader | freeBusyReader; null on older rows, not held against the calendar. */
  accessRole: string | null;
}

export interface BlockAccount {
  id: string;
  canWrite: boolean;
  writesOwn: boolean;
}

export const writableRole = (role: string | null): boolean => role === null || role === "owner" || role === "writer";

export function takesBlocks(c: BlockCalendar, accounts: readonly BlockAccount[]): boolean {
  const a = accounts.find((x) => x.id === c.accountId);
  if (!a?.canWrite) return false;
  return a.writesOwn ? writableRole(c.accessRole) : c.summary === APP_CALENDAR;
}
