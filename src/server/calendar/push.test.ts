import { describe, expect, it, vi } from "vitest";
import type { ProviderEvent } from "./provider";
import { blockIdFrom, decideEcho, eventBodyFor, eventIdFor, pushBlocks, reconcileOurs, type EventWriter, type PushBlock, type PushStore, type WriteOutcome } from "./push";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const block = (over: Partial<PushBlock> = {}): PushBlock => ({
  id: UUID,
  user_id: "u1",
  account_id: "acct",
  calendar_id: "cal-1",
  external_calendar_id: "primary",
  title: null,
  task_title: "Draft the proposal",
  source: "manual",
  task_id: "t1",
  start_at: "2026-09-16T09:00:00+00:00",
  end_at: "2026-09-16T10:00:00+00:00",
  timezone: "Europe/London",
  external_event_id: null,
  external_etag: null,
  deleted: false,
  push_attempts: 0,
  ...over,
});

const event = (over: Partial<ProviderEvent> = {}): ProviderEvent => ({
  externalId: eventIdFor(UUID),
  recurringEventId: null,
  originalStartAt: null,
  summary: "Draft the proposal",
  startAt: "2026-09-16T09:00:00.000Z",
  endAt: "2026-09-16T10:00:00.000Z",
  startDate: null,
  endDate: null,
  allDay: false,
  busy: true,
  status: "confirmed",
  selfResponse: null,
  eventType: "default",
  isOurs: true,
  etag: '"v1"',
  ...over,
});

function fakes(blocks: PushBlock[], writerOver: Partial<EventWriter> = {}) {
  const log: string[] = [];
  const store: PushStore = {
    claimBlocks: vi.fn(async () => blocks),
    pushed: vi.fn(async (id, cal, eventId, etag) => void log.push(`pushed ${id.slice(0, 4)} ${cal} ${eventId.slice(0, 6)} ${etag}`)),
    failed: vi.fn(async (id, error) => void log.push(`failed ${id.slice(0, 4)} ${error}`)),
    detached: vi.fn(async (id) => void log.push(`detached ${id.slice(0, 4)}`)),
    adopt: vi.fn(async (id, s, e, title, etag) => void log.push(`adopt ${id.slice(0, 4)} ${s}–${e} ${title} ${etag}`)),
    etag: vi.fn(async (id, etag) => void log.push(`etag ${id.slice(0, 4)} ${etag}`)),
  };
  const writer: EventWriter = {
    insertEvent: vi.fn(async (): Promise<WriteOutcome> => ({ outcome: "written", eventId: eventIdFor(UUID), etag: '"v1"' })),
    updateEvent: vi.fn(async (): Promise<WriteOutcome> => ({ outcome: "written", eventId: eventIdFor(UUID), etag: '"v2"' })),
    deleteEvent: vi.fn(async () => undefined),
    getEvent: vi.fn(async () => null),
    ...writerOver,
  };
  const writerFor = vi.fn(async () => writer);
  return { store, writer, writerFor, log };
}

describe("event ids", () => {
  it("are the block's uuid without dashes, and decode back", () => {
    expect(eventIdFor(UUID)).toBe("3f2504e04f8941d39a0c0305e82c3301");
    expect(eventIdFor(UUID)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(blockIdFrom(eventIdFor(UUID))).toBe(UUID);
    expect(blockIdFrom("abc123_someone_elses_id")).toBeNull();
    expect(blockIdFrom("3f2504e04f8941d39a0c0305e82c33")).toBeNull();
  });
});

describe("eventBodyFor", () => {
  it("carries our id, the task's title when the block has none, the zone, no reminders, and the private tag", () => {
    expect(eventBodyFor(block())).toEqual({
      id: "3f2504e04f8941d39a0c0305e82c3301",
      summary: "Draft the proposal",
      description: "Planned in Sparehour",
      start: { dateTime: "2026-09-16T09:00:00.000Z", timeZone: "Europe/London" },
      end: { dateTime: "2026-09-16T10:00:00.000Z", timeZone: "Europe/London" },
      transparency: "opaque",
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: { sparehour: "1", block_id: UUID, task_id: "t1", origin: "manual" } },
    });
    expect(eventBodyFor(block({ title: "Deep work", task_id: null, task_title: null })).summary).toBe("Deep work");
    expect(eventBodyFor(block({ title: null, task_title: null })).summary).toBe("Focused time");
  });
});

describe("decideEcho (§6.6)", () => {
  const stored = { start_at: "2026-09-16T09:00:00+00:00", end_at: "2026-09-16T10:00:00+00:00", external_etag: '"v1"' };
  it("ignores our own write, keeps a new etag for a cosmetic change, adopts moved times, detaches a deletion", () => {
    expect(decideEcho(event(), stored)).toEqual({ kind: "ignore" });
    expect(decideEcho(event({ etag: '"v2"', summary: "Renamed" }), stored)).toEqual({ kind: "etag", etag: '"v2"' });
    expect(decideEcho(event({ etag: '"v3"', startAt: "2026-09-16T11:00:00.000Z", endAt: "2026-09-16T12:00:00.000Z" }), stored)).toEqual({ kind: "adopt", startAt: "2026-09-16T11:00:00.000Z", endAt: "2026-09-16T12:00:00.000Z", title: "Draft the proposal", etag: '"v3"' });
    expect(decideEcho(event({ etag: '"v4"', status: "cancelled" }), stored)).toEqual({ kind: "detach" });
    expect(decideEcho(event({ etag: '"v5"', startAt: null, endAt: null, startDate: "2026-09-16", allDay: true }), stored)).toEqual({ kind: "detach" });
  });
});

describe("pushBlocks", () => {
  it("inserts a new block with our id and records the event; deletes a removed one; the writer is made once per account", async () => {
    const f = fakes([block(), block({ id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", deleted: true, external_event_id: "9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d", external_etag: '"x"' })]);
    const report = await pushBlocks({ store: f.store, writerFor: f.writerFor }, "u1");
    expect(report).toEqual({ written: 1, deleted: 1, adopted: 0, failed: 0 });
    expect(f.writer.insertEvent).toHaveBeenCalledWith("primary", expect.objectContaining({ id: "3f2504e04f8941d39a0c0305e82c3301" }));
    expect(f.writer.deleteEvent).toHaveBeenCalledWith("primary", "9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d");
    expect(f.writerFor).toHaveBeenCalledTimes(1);
    expect(f.log).toEqual(['pushed 3f25 cal-1 3f2504 "v1"', "pushed 9b1d cal-1 9b1deb null"]);
    expect(f.store.claimBlocks).toHaveBeenCalledWith("u1", 50);
  });

  it("updates a synced block with If-Match, and after 409 on insert falls back to an update", async () => {
    const f = fakes([block({ external_event_id: eventIdFor(UUID), external_etag: '"v1"' })]);
    await pushBlocks({ store: f.store, writerFor: f.writerFor });
    expect(f.writer.updateEvent).toHaveBeenCalledWith("primary", eventIdFor(UUID), expect.objectContaining({ summary: "Draft the proposal" }), '"v1"');
    expect(f.log).toEqual(['pushed 3f25 cal-1 3f2504 "v2"']);

    const g = fakes([block()], { insertEvent: vi.fn(async (): Promise<WriteOutcome> => ({ outcome: "exists" })) });
    await pushBlocks({ store: g.store, writerFor: g.writerFor });
    expect(g.writer.updateEvent).toHaveBeenCalledWith("primary", eventIdFor(UUID), expect.anything(), null);
    expect(g.log).toEqual(['pushed 3f25 cal-1 3f2504 "v2"']);
  });

  it("on 412 re-reads: a moved event is adopted, a matching one is rewritten with the fresh etag, a vanished one detaches", async () => {
    const moved = fakes([block({ external_event_id: eventIdFor(UUID), external_etag: '"v1"' })], {
      updateEvent: vi.fn(async (): Promise<WriteOutcome> => ({ outcome: "conflict" })),
      getEvent: vi.fn(async () => event({ etag: '"v9"', startAt: "2026-09-16T14:00:00.000Z", endAt: "2026-09-16T15:00:00.000Z" })),
    });
    expect(await pushBlocks({ store: moved.store, writerFor: moved.writerFor })).toMatchObject({ adopted: 1, written: 0 });
    expect(moved.log).toEqual(['adopt 3f25 2026-09-16T14:00:00.000Z–2026-09-16T15:00:00.000Z Draft the proposal "v9"']);

    const update = vi.fn(async (_c: string, _e: string, _b: unknown, ifMatch: string | null): Promise<WriteOutcome> => (ifMatch === '"v9"' ? { outcome: "written", eventId: eventIdFor(UUID), etag: '"v10"' } : { outcome: "conflict" }));
    const same = fakes([block({ external_event_id: eventIdFor(UUID), external_etag: '"v1"' })], { updateEvent: update, getEvent: vi.fn(async () => event({ etag: '"v9"', summary: "Renamed in Google" })) });
    expect(await pushBlocks({ store: same.store, writerFor: same.writerFor })).toMatchObject({ written: 1 });
    expect(same.log).toEqual(['pushed 3f25 cal-1 3f2504 "v10"']);

    const gone = fakes([block({ external_event_id: eventIdFor(UUID), external_etag: '"v1"' })], { updateEvent: vi.fn(async (): Promise<WriteOutcome> => ({ outcome: "gone" })) });
    await pushBlocks({ store: gone.store, writerFor: gone.writerFor });
    expect(gone.log).toEqual(["detached 3f25"]);
  });

  it("a failure is recorded on the block and the rest still go", async () => {
    const other = block({ id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" });
    const insert = vi.fn(async (_c: string, body: { id?: string }): Promise<WriteOutcome> => {
      if (body.id === eventIdFor(UUID)) throw new Error("google events.insert: 503");
      return { outcome: "written", eventId: body.id ?? "", etag: '"z"' };
    });
    const f = fakes([block(), other], { insertEvent: insert });
    expect(await pushBlocks({ store: f.store, writerFor: f.writerFor })).toEqual({ written: 1, deleted: 0, adopted: 0, failed: 1 });
    expect(f.log).toEqual(["failed 3f25 google events.insert: 503", 'pushed 9b1d cal-1 9b1deb "z"']);
  });
});

describe("reconcileOurs (sync path)", () => {
  it("touches only events that are ours and have a live block: ignore, etag, adopt, detach", async () => {
    const blocks: Record<string, { id: string; start_at: string; end_at: string; external_etag: string | null; deleted_at: string | null }> = {
      [eventIdFor(UUID)]: { id: UUID, start_at: "2026-09-16T09:00:00+00:00", end_at: "2026-09-16T10:00:00+00:00", external_etag: '"v1"', deleted_at: null },
      gone: { id: "b2", start_at: "2026-09-16T09:00:00+00:00", end_at: "2026-09-16T10:00:00+00:00", external_etag: '"v1"', deleted_at: "2026-09-15T00:00:00Z" },
    };
    const log: string[] = [];
    const store = {
      blockForEvent: vi.fn(async (_c: string, eventId: string) => blocks[eventId] ?? null),
      detached: vi.fn(async (id: string) => void log.push(`detached ${id}`)),
      adopt: vi.fn(async (id: string, s: string) => void log.push(`adopt ${id} ${s}`)),
      etag: vi.fn(async (id: string, etag: string | null) => void log.push(`etag ${id} ${etag}`)),
    };
    const touched = await reconcileOurs(store, "cal-1", [
      event(), // our own write: ignored
      event({ externalId: "foreign-1", isOurs: false }), // someone else's meeting: not even looked up
      event({ externalId: "gone", etag: '"v2"', status: "cancelled" }), // block already deleted here: nothing to do
      event({ etag: '"v2"', startAt: "2026-09-16T13:00:00.000Z", endAt: "2026-09-16T14:00:00.000Z" }), // moved in Google
      event({ externalId: "copied", isOurs: true, etag: '"c"' }), // a copy with our tag but no block: mirror only
    ]);
    expect(touched).toBe(1);
    expect(log).toEqual([`adopt ${UUID} 2026-09-16T13:00:00.000Z`]);
    expect(store.blockForEvent).toHaveBeenCalledTimes(4);
  });
});
