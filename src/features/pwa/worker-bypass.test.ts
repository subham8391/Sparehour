import { describe, expect, it } from "vitest";
import { bypassesWorker, isWorkerBootstrap } from "./worker-bypass";

const ORIGIN = "https://app.sparehour.test";
const req = (path: string, headers: Record<string, string> = {}) => new Request(new URL(path, ORIGIN), { headers });

describe("bypassesWorker", () => {
  it("leaves the sync service's stream and checkpoint to the browser", () => {
    expect(bypassesWorker(req("/powersync/sync/stream", { accept: "application/vnd.powersync.bson-stream;q=0.9,application/x-ndjson;q=0.8" }), ORIGIN)).toBe(true);
    expect(bypassesWorker(req("/powersync/write-checkpoint2.json?client_id=abc"), ORIGIN)).toBe(true);
  });

  it("never answers the sync token, the bootstrap or any other route handler", () => {
    for (const path of ["/api/sync/token", "/api/bootstrap", "/api/calendar/google/callback?code=x", "/api/calendar/config"]) {
      expect(bypassesWorker(req(path), ORIGIN), path).toBe(true);
    }
  });

  it("never answers the sign-in callback", () => {
    expect(bypassesWorker(req("/auth/callback?code=x&next=/today"), ORIGIN)).toBe(true);
  });

  it("leaves other origins alone: Supabase's auth carries the session's token", () => {
    expect(bypassesWorker(new Request("http://127.0.0.1:54321/auth/v1/user", { headers: { authorization: "Bearer t" } }), ORIGIN)).toBe(true);
  });

  it("leaves a request that asks for a stream alone, wherever it lives", () => {
    expect(bypassesWorker(req("/events", { accept: "text/event-stream" }), ORIGIN)).toBe(true);
  });

  it("leaves Turbopack's worker bootstrap alone", () => {
    expect(bypassesWorker(req("/_next/static/chunks/turbopack-worker-2ru9m5gbh1na6.js?params=x"), ORIGIN)).toBe(true);
    expect(isWorkerBootstrap("/_next/static/chunks/turbopack-3yn6gz2ry9_io.js")).toBe(false);
  });

  it("still answers the shell: pages, hashed chunks, the wasm, icons", () => {
    for (const path of ["/today", "/offline", "/", "/_next/static/chunks/26apgxple515q.css", "/_next/static/chunks/turbopack-3yn6gz2ry9_io.js", "/wa-sqlite.wasm", "/icon-192.png", "/manifest.webmanifest"]) {
      expect(bypassesWorker(req(path, { accept: "text/html,*/*" }), ORIGIN), path).toBe(false);
    }
  });

  it("only matches whole path segments", () => {
    expect(bypassesWorker(req("/apis-guide"), ORIGIN)).toBe(false);
    expect(bypassesWorker(req("/authors"), ORIGIN)).toBe(false);
    expect(bypassesWorker(req("/api"), ORIGIN)).toBe(true);
  });
});
