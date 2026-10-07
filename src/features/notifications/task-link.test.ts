import { describe, expect, it, vi } from "vitest";
import { parseDeepLink } from "./push";
import { fromNotification, taskLinkId } from "./push-deep-link";

// push-actions pulls the app's providers in; the lookup is tested on its own with a stand-in database.
vi.mock("@/features/blocking/use-block-repo", () => ({ useBlockRepo: () => ({}) }));
const { NOT_HERE, taskOnDevice } = await import("./push-actions");

describe("copied task links (DECISIONS.md “Copy link”)", () => {
  it("?task=<id> without the notification marker is a link to open that task; a notification's task is not", () => {
    expect(taskLinkId(new URLSearchParams("task=t1"))).toBe("t1");
    expect(taskLinkId(new URLSearchParams("task=a%20b&x=1"))).toBe("a b");
    expect(taskLinkId(new URLSearchParams("src=push&kind=block_start&task=t1"))).toBeNull();
    expect(taskLinkId(new URLSearchParams("task="))).toBeNull();
    expect(taskLinkId(new URLSearchParams(""))).toBeNull();
    // Notifications keep their own reading.
    expect(fromNotification(new URLSearchParams("task=t1"))).toBe(false);
    expect(parseDeepLink(new URLSearchParams("task=t1"))).toBeNull();
  });

  it("the task is here: found at once, no wait for a sync", async () => {
    const db = { getOptional: vi.fn(async () => ({ id: "t1" })), waitForFirstSync: vi.fn(), currentStatus: { hasSynced: false } };
    expect(await taskOnDevice(db, "t1")).toBe(true);
    expect(db.waitForFirstSync).not.toHaveBeenCalled();
  });

  it("not here on a device that has synced: answered at once", async () => {
    const db = { getOptional: vi.fn(async () => null), waitForFirstSync: vi.fn(), currentStatus: { hasSynced: true } };
    expect(await taskOnDevice(db, "t1")).toBe(false);
    expect(db.waitForFirstSync).not.toHaveBeenCalled();
  });

  it("a device still on its first sync looks again once it has synced, and never waits past the limit", async () => {
    let synced = false;
    const db = {
      getOptional: vi.fn(async () => (synced ? { id: "t1" } : null)),
      waitForFirstSync: vi.fn(async () => {
        synced = true;
      }),
      currentStatus: { hasSynced: false },
    };
    expect(await taskOnDevice(db, "t1")).toBe(true);
    const stuck = { getOptional: vi.fn(async () => null), waitForFirstSync: vi.fn(() => new Promise<void>(() => undefined)), currentStatus: { hasSynced: false } };
    expect(await taskOnDevice(stuck, "t1", 10)).toBe(false);
    expect(NOT_HERE).toBe("That task isn’t on this device.");
  });
});
