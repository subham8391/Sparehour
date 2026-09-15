// The sync engine (SYSTEM_DESIGN.md §6.3), provider-agnostic and pure over
// two ports: an event source and a mirror store. Full sync sweeps every page
// and writes only the window; incremental follows the sync token; a 410
// drops the token, wipes the calendar's mirror and starts again.
import { FullSyncRequired, type EventSource, type ProviderEvent } from "./provider";

export interface CalendarRef {
  id: string;
  spaceId: string;
  userId: string;
  externalId: string;
  syncToken: string | null;
}

export interface SyncWindow {
  /** YYYY-MM-DD, inclusive: today − 90 days … today + 400 days (§6.3). */
  from: string;
  to: string;
}

export interface MirrorStore {
  /** Full sync: what is there now, and nothing else. */
  replaceEvents(calendar: CalendarRef, rows: ProviderEvent[]): Promise<void>;
  upsertEvents(calendar: CalendarRef, rows: ProviderEvent[]): Promise<void>;
  removeEvents(calendar: CalendarRef, externalIds: string[]): Promise<void>;
  setSyncToken(calendarId: string, token: string | null): Promise<void>;
}

export interface SyncOutcome {
  mode: "full" | "incremental";
  upserted: number;
  removed: number;
  pages: number;
}

export function windowAround(today: string, before = 90, after = 400): SyncWindow {
  const day = new Date(`${today}T00:00:00Z`);
  const shift = (n: number) => new Date(day.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { from: shift(-before), to: shift(after) };
}

/** An event's calendar day for windowing (UTC for timed events — a day either way does not matter here). */
const dayOf = (e: ProviderEvent): string | null => e.startDate ?? (e.startAt ? e.startAt.slice(0, 10) : null);

export const inWindow = (e: ProviderEvent, w: SyncWindow): boolean => {
  const d = dayOf(e);
  return d !== null && d >= w.from && d <= w.to;
};

const MAX_PAGES = 400; // a decade of a busy calendar; past this something is wrong

async function fullSync(source: EventSource, store: MirrorStore, calendar: CalendarRef, window: SyncWindow): Promise<SyncOutcome> {
  const keep: ProviderEvent[] = [];
  let pageToken: string | null = null;
  let syncToken: string | null = null;
  let pages = 0;
  do {
    const page = await source.listEvents(calendar.externalId, { pageToken });
    pages++;
    for (const e of page.items) if (e.status !== "cancelled" && inWindow(e, window)) keep.push(e);
    pageToken = page.nextPageToken;
    syncToken = page.nextSyncToken ?? syncToken;
    if (pages > MAX_PAGES) throw new Error(`full sync of ${calendar.externalId} exceeded ${MAX_PAGES} pages`);
  } while (pageToken);
  await store.replaceEvents(calendar, keep);
  await store.setSyncToken(calendar.id, syncToken);
  return { mode: "full", upserted: keep.length, removed: 0, pages };
}

async function incrementalSync(source: EventSource, store: MirrorStore, calendar: CalendarRef, window: SyncWindow, syncToken: string): Promise<SyncOutcome> {
  let upserted = 0;
  let removed = 0;
  let pages = 0;
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  do {
    const page = await source.listEvents(calendar.externalId, { syncToken, pageToken });
    pages++;
    const gone = page.items.filter((e) => e.status === "cancelled" || !inWindow(e, window)).map((e) => e.externalId);
    const changed = page.items.filter((e) => e.status !== "cancelled" && inWindow(e, window));
    if (gone.length) await store.removeEvents(calendar, gone);
    if (changed.length) await store.upsertEvents(calendar, changed);
    removed += gone.length;
    upserted += changed.length;
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    if (pages > MAX_PAGES) throw new Error(`incremental sync of ${calendar.externalId} exceeded ${MAX_PAGES} pages`);
  } while (pageToken);
  if (nextSyncToken) await store.setSyncToken(calendar.id, nextSyncToken);
  return { mode: "incremental", upserted, removed, pages };
}

export async function syncCalendarEvents(source: EventSource, store: MirrorStore, calendar: CalendarRef, window: SyncWindow): Promise<SyncOutcome> {
  if (!calendar.syncToken) return fullSync(source, store, calendar, window);
  try {
    return await incrementalSync(source, store, calendar, window, calendar.syncToken);
  } catch (e) {
    if (!(e instanceof FullSyncRequired)) throw e;
    await store.setSyncToken(calendar.id, null);
    return fullSync(source, store, calendar, window);
  }
}
