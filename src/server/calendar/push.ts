// The push queue (SYSTEM_DESIGN.md §6.5): blocks that Google is behind on,
// written with client-generated event ids so a failed call never duplicates,
// tagged in extendedProperties so an inbound copy is recognised as ours, and
// the echo rules (§6.6) for what comes back. Pure over ports; the store and
// Google are injected.
import type { ProviderEvent } from "./provider";

/** A block's event id in Google's id space: the uuid's hex is valid base32hex (a–v, 0–9) as it is. */
export const eventIdFor = (blockId: string): string => blockId.replace(/-/g, "").toLowerCase();

/** The block behind an event id we generated, or null for anyone else's id. */
export function blockIdFrom(eventId: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(eventId)) return null;
  return `${eventId.slice(0, 8)}-${eventId.slice(8, 12)}-${eventId.slice(12, 16)}-${eventId.slice(16, 20)}-${eventId.slice(20)}`;
}

/** A row from time_blocks_claim_push. */
export interface PushBlock {
  id: string;
  user_id: string;
  account_id: string;
  calendar_id: string;
  external_calendar_id: string;
  title: string | null;
  task_title: string | null;
  source: string;
  task_id: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  external_event_id: string | null;
  external_etag: string | null;
  deleted: boolean;
  push_attempts: number;
}

export interface BlockEventBody {
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  transparency: "opaque";
  reminders: { useDefault: false; overrides: [] };
  extendedProperties: { private: Record<string, string> };
}

export function eventBodyFor(b: PushBlock, withId = true): BlockEventBody {
  return {
    ...(withId ? { id: eventIdFor(b.id) } : {}),
    summary: b.title ?? b.task_title ?? "Focused time",
    description: "Planned in Sparehour",
    start: { dateTime: new Date(b.start_at).toISOString(), timeZone: b.timezone },
    end: { dateTime: new Date(b.end_at).toISOString(), timeZone: b.timezone },
    transparency: "opaque",
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { sparehour: "1", block_id: b.id, task_id: b.task_id ?? "", origin: b.source } },
  };
}

export type WriteOutcome = { outcome: "written"; eventId: string; etag: string | null } | { outcome: "exists" } | { outcome: "conflict" } | { outcome: "gone" };

export interface EventWriter {
  insertEvent(calendarId: string, body: BlockEventBody): Promise<WriteOutcome>;
  updateEvent(calendarId: string, eventId: string, body: BlockEventBody, ifMatch: string | null): Promise<WriteOutcome>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  getEvent(calendarId: string, eventId: string): Promise<ProviderEvent | null>;
}

export interface PushStore {
  claimBlocks(userId: string | null, limit: number): Promise<PushBlock[]>;
  pushed(id: string, calendarId: string, eventId: string, etag: string | null): Promise<void>;
  failed(id: string, error: string): Promise<void>;
  detached(id: string): Promise<void>;
  adopt(id: string, startAt: string, endAt: string, title: string | null, etag: string | null): Promise<void>;
  etag(id: string, etag: string | null): Promise<void>;
}

export interface PushDeps {
  store: PushStore;
  /** A writer for the account that owns the block's write calendar. */
  writerFor: (accountId: string) => Promise<EventWriter>;
}

export interface PushReport {
  written: number;
  deleted: number;
  adopted: number;
  failed: number;
}

/** §6.6, in words: what an inbound copy of one of our events means for the block. */
export type EchoDecision = { kind: "ignore" } | { kind: "etag"; etag: string | null } | { kind: "adopt"; startAt: string; endAt: string; title: string | null; etag: string | null } | { kind: "detach" };

export function decideEcho(event: ProviderEvent, block: { start_at: string; end_at: string; external_etag: string | null }): EchoDecision {
  if (event.status === "cancelled") return { kind: "detach" };
  if (event.etag !== null && event.etag === block.external_etag) return { kind: "ignore" }; // our own write, back again
  if (!event.startAt || !event.endAt) return { kind: "detach" }; // turned into an all-day event: not a block any more
  const sameTimes = new Date(event.startAt).getTime() === new Date(block.start_at).getTime() && new Date(event.endAt).getTime() === new Date(block.end_at).getTime();
  if (sameTimes) return { kind: "etag", etag: event.etag }; // a cosmetic change: remember the version, nothing else
  return { kind: "adopt", startAt: event.startAt, endAt: event.endAt, title: event.summary, etag: event.etag }; // Google wins
}

async function pushOne(b: PushBlock, writer: EventWriter, store: PushStore, report: PushReport): Promise<void> {
  if (b.deleted) {
    if (b.external_event_id) await writer.deleteEvent(b.external_calendar_id, b.external_event_id);
    await store.pushed(b.id, b.calendar_id, b.external_event_id ?? eventIdFor(b.id), null);
    report.deleted++;
    return;
  }
  const eventId = b.external_event_id ?? eventIdFor(b.id);
  const body = eventBodyFor(b);
  let result = b.external_event_id ? await writer.updateEvent(b.external_calendar_id, eventId, body, b.external_etag) : await writer.insertEvent(b.external_calendar_id, body);
  if (result.outcome === "exists") result = await writer.updateEvent(b.external_calendar_id, eventId, body, null); // ours from a failed earlier call
  if (result.outcome === "conflict") {
    // Someone changed the event since we last saw it: re-read and let §6.6 decide, once.
    const current = await writer.getEvent(b.external_calendar_id, eventId);
    if (!current) {
      await store.detached(b.id);
      report.adopted++;
      return;
    }
    const decision = decideEcho(current, b);
    if (decision.kind === "adopt") {
      await store.adopt(b.id, decision.startAt, decision.endAt, decision.title, decision.etag);
      report.adopted++;
      return;
    }
    result = await writer.updateEvent(b.external_calendar_id, eventId, body, current.etag);
    if (result.outcome !== "written") throw new Error(`google would not take the block after a re-read (${result.outcome})`);
  }
  if (result.outcome === "gone") {
    await store.detached(b.id);
    report.adopted++;
    return;
  }
  if (result.outcome !== "written") throw new Error(`unexpected outcome ${result.outcome}`);
  await store.pushed(b.id, b.calendar_id, result.eventId, result.etag);
  report.written++;
}

/** Push what is due — one person's blocks, or everyone's — and say what happened. */
export async function pushBlocks(deps: PushDeps, userId: string | null = null, limit = 50): Promise<PushReport> {
  const report: PushReport = { written: 0, deleted: 0, adopted: 0, failed: 0 };
  const writers = new Map<string, EventWriter>();
  for (const b of await deps.store.claimBlocks(userId, limit)) {
    try {
      let writer = writers.get(b.account_id);
      if (!writer) {
        writer = await deps.writerFor(b.account_id);
        writers.set(b.account_id, writer);
      }
      await pushOne(b, writer, deps.store, report);
    } catch (e) {
      await deps.store.failed(b.id, e instanceof Error ? e.message : String(e));
      report.failed++;
    }
  }
  return report;
}

/** §6.6 for the sync path: an inbound event that is ours, matched to its block by the store. */
export interface OurEventStore {
  blockForEvent(calendarId: string, eventId: string): Promise<{ id: string; start_at: string; end_at: string; external_etag: string | null; deleted_at: string | null } | null>;
  detached(id: string): Promise<void>;
  adopt(id: string, startAt: string, endAt: string, title: string | null, etag: string | null): Promise<void>;
  etag(id: string, etag: string | null): Promise<void>;
}

export const looksOurs = (e: ProviderEvent): boolean => e.isOurs || blockIdFrom(e.externalId) !== null;

export async function reconcileOurs(store: OurEventStore, calendarId: string, events: readonly ProviderEvent[]): Promise<number> {
  let touched = 0;
  for (const e of events) {
    if (!looksOurs(e)) continue;
    const block = await store.blockForEvent(calendarId, e.externalId);
    if (!block || block.deleted_at) continue; // a copy someone made, or a block already on its way out: the mirror keeps it as a foreign event
    const decision = decideEcho(e, block);
    if (decision.kind === "ignore") continue;
    if (decision.kind === "detach") await store.detached(block.id);
    else if (decision.kind === "adopt") await store.adopt(block.id, decision.startAt, decision.endAt, decision.title, decision.etag);
    else await store.etag(block.id, decision.etag);
    touched++;
  }
  return touched;
}
