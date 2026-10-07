// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isQuotaError, nearQuota, readStorageFull, setStorageFull, subscribeStorageFull, watchQuota } from "./quota";

afterEach(() => {
  setStorageFull(null);
});

describe("isQuotaError (SCREENS.md §21 Quota / storage full)", () => {
  it("knows each browser's way of saying there is no room, and SQLite's", () => {
    expect(isQuotaError(new DOMException("The quota has been exceeded.", "QuotaExceededError"))).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED", message: "" })).toBe(true);
    expect(isQuotaError(new Error("SqliteError: database or disk is full (code 13)"))).toBe(true);
    expect(isQuotaError(new Error("write failed", { cause: new DOMException("x", "QuotaExceededError") }))).toBe(true);
    expect(isQuotaError("QuotaExceededError")).toBe(true);
  });

  it("is not fooled by other failures", () => {
    expect(isQuotaError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isQuotaError(new DOMException("denied", "SecurityError"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe("nearQuota", () => {
  it("is true from 95 % of a known quota", () => {
    expect(nearQuota({ usage: 96, quota: 100 })).toBe(true);
    expect(nearQuota({ usage: 94, quota: 100 })).toBe(false);
    expect(nearQuota({ usage: 10, quota: 0 })).toBe(false);
    expect(nearQuota(undefined)).toBe(false);
  });
});

describe("watchQuota", () => {
  it("a write refused for room raises the banner, and it stays even when an estimate later finds space", async () => {
    const seen = vi.fn();
    const off = subscribeStorageFull(seen);
    let usage = 10;
    const stop = watchQuota(window, { estimate: () => Promise.resolve({ usage, quota: 100 }) }, 20);
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new DOMException("full", "QuotaExceededError") }));
    expect(readStorageFull()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    usage = 5;
    await new Promise((r) => setTimeout(r, 50));
    expect(readStorageFull()).toBe(true);
    stop();
    off();
  });

  it("an estimate near the quota raises it, and one with room again clears it", async () => {
    let usage = 99;
    const stop = watchQuota(window, { estimate: () => Promise.resolve({ usage, quota: 100 }) }, 20);
    await vi.waitFor(() => expect(readStorageFull()).toBe(true));
    usage = 40;
    await vi.waitFor(() => expect(readStorageFull()).toBe(false));
    stop();
  });

  it("other unhandled failures leave it alone", () => {
    const stop = watchQuota(window, undefined);
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new TypeError("Failed to fetch") }));
    expect(readStorageFull()).toBe(false);
    stop();
  });
});
