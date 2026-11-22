import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { forgetAppToken, registerAppToken } from "./app-tokens";

const TOKEN = "ExponentPushToken[abc123]";
const NOW = new Date("2026-11-22T09:00:00Z");

/** A stand-in for the service client: records what was asked of app_push_tokens and answers with `error`. */
function fakeDb(error: { code?: string; message: string } | null = null) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain = {
    eq: (...args: unknown[]) => (calls.push({ op: "eq", args }), chain),
    is: (...args: unknown[]) => (calls.push({ op: "is", args }), Promise.resolve({ error })),
  };
  const table = {
    upsert: (...args: unknown[]) => (calls.push({ op: "upsert", args }), Promise.resolve({ error })),
    update: (...args: unknown[]) => (calls.push({ op: "update", args }), chain),
  };
  const from = vi.fn(() => table);
  return { db: { from } as unknown as SupabaseClient, from, calls };
}

describe("registerAppToken", () => {
  it("keeps the phone's token for the caller, live again, and moves it if another account had it", async () => {
    const { db, from, calls } = fakeDb();
    expect(await registerAppToken(db, "u1", TOKEN, NOW)).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("app_push_tokens");
    expect(calls[0]).toEqual({ op: "upsert", args: [{ user_id: "u1", token: TOKEN, platform: "android", failure_count: 0, deleted_at: null, updated_at: NOW.toISOString() }, { onConflict: "token" }] });
  });

  it("refuses what is not an Expo token without asking the database", async () => {
    const { db, from } = fakeDb();
    expect(await registerAppToken(db, "u1", "https://push.test/1")).toEqual({ ok: false, status: 400, error: "bad_token" });
    expect(await registerAppToken(db, "u1", undefined)).toEqual({ ok: false, status: 400, error: "bad_token" });
    expect(from).not.toHaveBeenCalled();
  });

  it("says too many when the account already has twenty phones", async () => {
    const { db } = fakeDb({ code: "54000", message: "too many push tokens for one account" });
    expect(await registerAppToken(db, "u1", TOKEN)).toEqual({ ok: false, status: 409, error: "too_many" });
  });

  it("answers a server error for anything else, without the database's words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ message: "boom" });
    expect(await registerAppToken(db, "u1", TOKEN)).toEqual({ ok: false, status: 500, error: "server" });
  });
});

describe("forgetAppToken", () => {
  it("retires only the caller's own live row for that token", async () => {
    const { db, calls } = fakeDb();
    expect(await forgetAppToken(db, "u1", TOKEN, NOW)).toEqual({ ok: true });
    expect(calls).toEqual([
      { op: "update", args: [{ deleted_at: NOW.toISOString(), updated_at: NOW.toISOString() }] },
      { op: "eq", args: ["token", TOKEN] },
      { op: "eq", args: ["user_id", "u1"] },
      { op: "is", args: ["deleted_at", null] },
    ]);
  });

  it("refuses what is not an Expo token", async () => {
    const { db, from } = fakeDb();
    expect(await forgetAppToken(db, "u1", 7)).toEqual({ ok: false, status: 400, error: "bad_token" });
    expect(from).not.toHaveBeenCalled();
  });
});
