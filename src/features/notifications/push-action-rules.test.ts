import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { PushAction } from "./actions";
import type { DeepLink } from "./push";
import { SHEET_TITLES, carryOutPushAction, type PushActionPorts } from "./push-action-rules";

const ports = () => {
  const p = {
    db: { getOptional: vi.fn(async () => ({ start_at: "2026-11-22T09:00:00.000Z", end_at: "2026-11-22T10:00:00.000Z" })) },
    tasks: { update: vi.fn(async () => undefined) },
    blocks: { move: vi.fn(async () => undefined) },
    today: localDate("2026-11-22"),
    openTask: vi.fn(),
    go: vi.fn(),
  };
  return p as typeof p & PushActionPorts;
};
const link = (over: Partial<DeepLink> = {}): DeepLink => ({ kind: "block_start", taskId: "t1", blockId: "b1", action: null, ...over });
const run = (action: PushAction, l = link()) => {
  const p = ports();
  return carryOutPushAction(l, action, p).then(() => p);
};

describe("carryOutPushAction (shared by the web and the Android app)", () => {
  it("start opens the task", async () => {
    expect((await run("start")).openTask).toHaveBeenCalledWith("t1");
    expect((await run("start", link({ taskId: null }))).openTask).not.toHaveBeenCalled();
  });

  it("snooze moves the block fifteen minutes; a block that is gone is left alone", async () => {
    const p = await run("snooze");
    expect(p.db.getOptional).toHaveBeenCalledWith(expect.stringContaining("from time_blocks"), ["b1"]);
    expect(p.blocks.move).toHaveBeenCalledWith("b1", "2026-11-22T09:15:00.000Z", "2026-11-22T10:15:00.000Z");
    const gone = ports();
    gone.db.getOptional.mockResolvedValueOnce(null as never);
    await carryOutPushAction(link(), "snooze", gone);
    expect(gone.blocks.move).not.toHaveBeenCalled();
  });

  it("today and tomorrow move the task, untimed and out of the evening", async () => {
    expect((await run("today")).tasks.update).toHaveBeenCalledWith("t1", { doDate: localDate("2026-11-22"), doTime: null, evening: false }, "Moved {title} to today");
    expect((await run("tomorrow")).tasks.update).toHaveBeenCalledWith("t1", { doDate: localDate("2026-11-23"), doTime: null, evening: false }, "Moved {title} to tomorrow");
  });

  it("plan and shutdown go to their pages; dismiss does nothing", async () => {
    expect((await run("plan")).go).toHaveBeenCalledWith("/plan");
    expect((await run("shutdown")).go).toHaveBeenCalledWith("/shutdown");
    const p = await run("dismiss");
    expect([p.go, p.openTask, p.tasks.update, p.blocks.move].every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("titles every kind's sheet", () => {
    expect(SHEET_TITLES).toEqual({ block_start: "Your block is starting.", deadline_eve: "Due tomorrow.", deadline_day: "Due today.", morning: "Good morning.", shutdown: "Wrapping up?" });
  });
});
