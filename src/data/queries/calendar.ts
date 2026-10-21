// Calendar settings (SCREENS.md §18): the connected accounts as the server
// mirrors them, and every calendar with the choices a person makes about it.
export const CALENDAR_CONNECTIONS_SQL = `select id, provider, email, status, can_write, can_read_titles, can_write_own, last_synced_at, last_error, write_lost_at from calendar_connections where deleted_at is null order by created_at`;

export const CALENDARS_FULL_SQL = `select id, calendar_account_id, external_id, summary, color, access_role, read, private, write_target, last_synced_at from calendars where deleted_at is null order by summary, id`;

export interface CalendarConnectionRow {
  id: string;
  provider: string | null;
  email: string | null;
  status: string | null;
  can_write: number | null;
  /** Full access: events come with titles (DECISIONS.md, 2026-10-21); otherwise busy times only. */
  can_read_titles?: number | null;
  /** Blocks may go to any calendar the person owns; otherwise only to the app-created "Sparehour" one. */
  can_write_own?: number | null;
  last_synced_at: string | null;
  last_error: string | null;
  /** When the calendar blocks were written to left Google (server-owned); blocking pauses until another is chosen. */
  write_lost_at?: string | null;
}

export interface CalendarFullRow {
  id: string;
  calendar_account_id: string | null;
  external_id: string | null;
  summary: string | null;
  color: string | null;
  access_role: string | null;
  read: number | null;
  private: number | null;
  write_target: number | null;
  last_synced_at: string | null;
}
