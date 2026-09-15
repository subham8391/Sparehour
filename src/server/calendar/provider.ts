// The provider-agnostic surface (SYSTEM_DESIGN.md §6.8): everything above it
// — the sync engine, the account worker, the routes — speaks these types.
// Google is the only implementation at M1; Outlook arrives at M3.

export interface ProviderCalendar {
  externalId: string;
  summary: string;
  timezone: string | null;
  color: string | null;
  /** "owner" | "writer" | "reader" | "freeBusyReader" */
  accessRole: string;
  primary: boolean;
}

/** One event as the mirror stores it (§5.4 classification inputs). */
export interface ProviderEvent {
  externalId: string;
  recurringEventId: string | null;
  originalStartAt: string | null;
  summary: string | null;
  /** UTC ISO for timed events; null for all-day. */
  startAt: string | null;
  endAt: string | null;
  /** YYYY-MM-DD for all-day events (end exclusive, as the provider reports it). */
  startDate: string | null;
  endDate: string | null;
  allDay: boolean;
  busy: boolean;
  /** "confirmed" | "tentative" | "cancelled" */
  status: string;
  selfResponse: string | null;
  eventType: string;
  isOurs: boolean;
  etag: string | null;
}

export interface EventPage {
  items: ProviderEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
}

export interface EventSource {
  listEvents(externalCalendarId: string, cursor: { syncToken?: string | null; pageToken?: string | null }): Promise<EventPage>;
}

export interface CalendarProvider extends EventSource {
  listCalendars(): Promise<ProviderCalendar[]>;
}

/** The sync series is gone (410): drop the token, wipe the mirror, start again. */
export class FullSyncRequired extends Error {
  constructor() {
    super("full sync required");
    this.name = "FullSyncRequired";
  }
}

/** The account's grant no longer works: mark it, stop, ask the person to reconnect. */
export class NeedsReauth extends Error {
  constructor(message = "calendar access was revoked") {
    super(message);
    this.name = "NeedsReauth";
  }
}
