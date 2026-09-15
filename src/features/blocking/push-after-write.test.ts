import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelScheduledPush, schedulePush } from "./push-after-write";

describe("schedulePush", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cancelScheduledPush();
    vi.useRealTimers();
  });

  it("collapses a burst of changes into one push, and swallows a failed request", async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new Error("offline")));
    schedulePush(fetchImpl as unknown as typeof fetch, 100);
    schedulePush(fetchImpl as unknown as typeof fetch, 100);
    schedulePush(fetchImpl as unknown as typeof fetch, 100);
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/calendar/push", { method: "POST", credentials: "include" });
  });
});
