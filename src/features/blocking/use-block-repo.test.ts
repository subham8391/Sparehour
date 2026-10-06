// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteBlockCreated } from "@/features/notifications/block-nudge-store";
import { schedulePush } from "./push-after-write";
import { useBlockRepo } from "./use-block-repo";

const execute = vi.fn().mockResolvedValue({});
const getAll = vi.fn().mockResolvedValue([]);
const getOptional = vi.fn().mockResolvedValue(null);
const writeTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getAll, getOptional }));
const db = { execute, getAll, getOptional, writeTransaction };

vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db }));
vi.mock("@/features/undo/undo-provider", () => ({ useUndoSink: () => null }));
vi.mock("./push-after-write", () => ({ schedulePush: vi.fn() }));
vi.mock("@/features/notifications/block-nudge-store", () => ({ noteBlockCreated: vi.fn() }));

beforeEach(() => {
  vi.mocked(noteBlockCreated).mockClear();
  vi.mocked(schedulePush).mockClear();
});

describe("useBlockRepo: the first-block reminder ask (PRODUCT_SPEC.md §14 rule 7)", () => {
  it("a block made by drag, tap or key is noted, and goes to the calendar soon after", async () => {
    const { result } = renderHook(() => useBlockRepo());
    await result.current.create({ spaceId: "s", userId: "u", taskId: "t1", title: "Draft", startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T09:45:00Z" });
    expect(noteBlockCreated).toHaveBeenCalledTimes(1);
    expect(schedulePush).toHaveBeenCalledTimes(1);
  });

  it("approving a plan that makes blocks is noted too; moving one is not", async () => {
    const { result } = renderHook(() => useBlockRepo());
    await result.current.approvePlan({ spaceId: "s", userId: "u", blocks: [{ taskId: "t1", title: "Draft", startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T09:45:00Z" }], replaces: [] });
    expect(noteBlockCreated).toHaveBeenCalledTimes(1);
    await result.current.approvePlan({ spaceId: "s", userId: "u", blocks: [], replaces: [] });
    expect(noteBlockCreated).toHaveBeenCalledTimes(1);
    await result.current.move("b1", "2026-10-06T10:00:00Z", "2026-10-06T10:45:00Z");
    expect(noteBlockCreated).toHaveBeenCalledTimes(1);
  });
});
