import { describe, expect, it } from "vitest";
import { UploadBody, sanitize, type WireOp } from "./upload";

const op = (over: Partial<WireOp>): WireOp => ({
  client_id: "1",
  op: "PATCH",
  table: "tasks",
  id: "6f1e2c9a-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  data: { title: "x" },
  ...over,
});

describe("sanitize", () => {
  it("drops server-owned columns and keeps the rest", () => {
    const r = sanitize(op({ data: { title: "Call Sam", carry_count: 99, last_carried_at: "2026-09-14", updated_at: "now" } }));
    expect(r?.data).toEqual({ title: "Call Sam" });
  });

  it("never lets a client write calendar_events", () => {
    expect(sanitize(op({ table: "calendar_events", op: "PUT", data: { summary: "fake meeting" } }))).toBeNull();
  });

  it("returns null when a PATCH has nothing left", () => {
    expect(sanitize(op({ data: { carry_count: 5 } }))).toBeNull();
  });

  it("passes deletes through untouched", () => {
    const d = op({ op: "DELETE", data: undefined });
    expect(sanitize(d)).toBe(d);
  });

  it("the rollover's markers are the server's; the auto-file stamp may be cleared, never set", () => {
    const at = "2026-10-06T04:00:00.000Z";
    expect(sanitize(op({ data: { title: "t", expired_at: at, auto_filed_at: at } }))?.data).toEqual({ title: "t" });
    expect(sanitize(op({ data: { expired_at: null } }))).toBeNull();
    expect(sanitize(op({ data: { auto_filed_at: null } }))?.data).toEqual({ auto_filed_at: null });
    expect(sanitize(op({ table: "task_completions", op: "PUT", data: { task_id: "t1", carry_count_before: 9, last_carried_before: "2026-10-01" } }))?.data).toEqual({ task_id: "t1" });
  });

  it("strips id from data (it travels separately)", () => {
    expect(sanitize(op({ op: "PUT", data: { id: "other", title: "t" } }))?.data).toEqual({ title: "t" });
  });

  it("a soft delete is a client write: deleted_at survives on ordinary rows and is dropped only where a client may never delete", () => {
    const at = "2026-09-14T12:41:00.000Z";
    expect(sanitize(op({ table: "time_blocks", data: { deleted_at: at, updated_at: at } }))?.data).toEqual({ deleted_at: at });
    expect(sanitize(op({ table: "headings", data: { deleted_at: at } }))?.data).toEqual({ deleted_at: at });
    expect(sanitize(op({ table: "task_tags", data: { deleted_at: at } }))?.data).toEqual({ deleted_at: at });
    expect(sanitize(op({ table: "calendars", data: { deleted_at: at, read: 0 } }))?.data).toEqual({ read: 0 });
    expect(sanitize(op({ table: "user_settings", data: { deleted_at: at } }))).toBeNull();
    expect(sanitize(op({ table: "spaces", data: { deleted_at: at } }))).toBeNull();
    expect(sanitize(op({ table: "users", data: { display_name: "x" } }))).toBeNull();
  });
});

describe("UploadBody", () => {
  it("accepts a well-formed batch and normalises numeric client ids", () => {
    const r = UploadBody.safeParse({ device_id: "d1", ops: [{ client_id: 7, op: "PUT", table: "tasks", id: "6f1e2c9a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", data: { title: "t" } }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ops[0].client_id).toBe("7");
  });

  it("rejects bad table names, bad ids and empty batches", () => {
    expect(UploadBody.safeParse({ device_id: "d1", ops: [] }).success).toBe(false);
    expect(UploadBody.safeParse({ device_id: "d1", ops: [{ client_id: "1", op: "PUT", table: "tasks; drop", id: "6f1e2c9a-3b4d-4e5f-8a9b-0c1d2e3f4a5b" }] }).success).toBe(false);
    expect(UploadBody.safeParse({ device_id: "d1", ops: [{ client_id: "1", op: "PUT", table: "tasks", id: "not-a-uuid" }] }).success).toBe(false);
  });
});
