// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadOnIdle } from "./preload-on-idle";

describe("preloadOnIdle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads once the browser reports idle time, and the cleanup cancels a pending request", () => {
    const callbacks: IdleRequestCallback[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => callbacks.push(cb));
    vi.stubGlobal("cancelIdleCallback", cancel);
    const load = vi.fn(() => Promise.resolve());

    const cleanup = preloadOnIdle(load);
    expect(load).not.toHaveBeenCalled();
    callbacks[0]({ didTimeout: false, timeRemaining: () => 50 });
    expect(load).toHaveBeenCalledTimes(1);

    cleanup();
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it("falls back to a short timer where requestIdleCallback is missing, and a failed load is swallowed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const load = vi.fn(() => Promise.reject(new Error("offline")));

    preloadOnIdle(load);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("the timer fallback can be cancelled too", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const load = vi.fn(() => Promise.resolve());
    const cleanup = preloadOnIdle(load);
    cleanup();
    vi.advanceTimersByTime(2000);
    expect(load).not.toHaveBeenCalled();
  });
});
