import { describe, expect, it, vi } from "vitest";
import { buildStamp } from "../../../next.config";
import { compareBuilds, fetchBootstrap, isUpdateRequired } from "./version";

describe("the build stamp", () => {
  it("is the build's UTC minute, so builds sort", () => {
    expect(buildStamp(new Date("2026-10-07T15:30:59Z"))).toBe("2026.10.07.1530");
    expect(buildStamp(new Date("2027-01-02T03:04:00Z"))).toBe("2027.01.02.0304");
  });
});

describe("compareBuilds", () => {
  it("compares part by part as numbers, missing parts counting as zero", () => {
    expect(compareBuilds("2026.10.07.1530", "2026.10.07.1530")).toBe(0);
    expect(compareBuilds("2026.10.07.1530", "2026.10.07.1531")).toBeLessThan(0);
    expect(compareBuilds("2026.10.10.0000", "2026.10.9.2359")).toBeGreaterThan(0);
    expect(compareBuilds("2026.10", "2026.10.0.0")).toBe(0);
    expect(compareBuilds("2026.9.30.2359", "2026.10")).toBeLessThan(0);
  });
});

describe("isUpdateRequired", () => {
  it("blocks only a build below the oldest one allowed", () => {
    expect(isUpdateRequired("2026.10.07.1530", "2026.10.07.1600")).toBe(true);
    expect(isUpdateRequired("2026.10.07.1530", "2026.10.07.1530")).toBe(false);
    expect(isUpdateRequired("2026.10.07.1530", "2026.10.06")).toBe(false);
  });

  it("never blocks without a gate, on a gate it cannot read, or a development build", () => {
    expect(isUpdateRequired("2026.10.07.1530", null)).toBe(false);
    expect(isUpdateRequired("2026.10.07.1530", undefined)).toBe(false);
    expect(isUpdateRequired("2026.10.07.1530", "")).toBe(false);
    expect(isUpdateRequired("2026.10.07.1530", "latest")).toBe(false);
    expect(isUpdateRequired("dev", "9999")).toBe(false);
  });
});

describe("fetchBootstrap", () => {
  it("reads min_client_version without the cache", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ min_client_version: "2026.10.07.1600", server_time: "2026-10-07T16:00:00Z" })));
    expect(await fetchBootstrap(fetchImpl as unknown as typeof fetch)).toEqual({ min_client_version: "2026.10.07.1600", server_time: "2026-10-07T16:00:00Z" });
    expect(fetchImpl).toHaveBeenCalledWith("/api/bootstrap", expect.objectContaining({ cache: "no-store" }));
  });

  it("is null offline, on an error status or a body it cannot read, which never blocks", async () => {
    expect(await fetchBootstrap((async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch)).toBeNull();
    expect(await fetchBootstrap((async () => new Response("no", { status: 502 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchBootstrap((async () => new Response("<html>")) as unknown as typeof fetch)).toBeNull();
    expect(await fetchBootstrap((async () => new Response(JSON.stringify({ min_client_version: 7 }))) as unknown as typeof fetch)).toEqual({ min_client_version: null, server_time: undefined });
  });
});
