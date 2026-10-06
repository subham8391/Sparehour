// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadOnIdle, useIdleMount } from "./preload-on-idle";

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

describe("useIdleMount", () => {
  afterEach(() => {
    cleanup(); // unmount (which cancels the idle request) while the stubs are still in place
    vi.unstubAllGlobals();
  });

  /** Stubs requestIdleCallback; the returned function plays the browser going idle. */
  function idle() {
    const callbacks: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => callbacks.push(cb));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    return () => callbacks.forEach((cb) => cb({ didTimeout: false, timeRemaining: () => 50 }));
  }

  it("mounts once the module has loaded in idle time, and stays mounted", async () => {
    const fire = idle();
    const load = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(({ needed }) => useIdleMount(load, needed), { initialProps: { needed: false } });
    expect(result.current).toBe(false);
    await act(async () => fire());
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
    rerender({ needed: false });
    expect(result.current).toBe(true);
  });

  it("mounts at once when it is needed before idle time, and stays mounted when the need goes away", () => {
    idle();
    const load = vi.fn(() => new Promise<void>(() => undefined));
    const { result, rerender } = renderHook(({ needed }) => useIdleMount(load, needed), { initialProps: { needed: false } });
    expect(result.current).toBe(false);
    rerender({ needed: true });
    expect(result.current).toBe(true);
    rerender({ needed: false });
    expect(result.current).toBe(true);
  });

  it("a module that fails to load in idle time stays unmounted until it is needed", async () => {
    const fire = idle();
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    const { result, rerender } = renderHook(({ needed }) => useIdleMount(load, needed), { initialProps: { needed: false } });
    await act(async () => fire());
    expect(result.current).toBe(false);
    rerender({ needed: true });
    expect(result.current).toBe(true);
  });
});
