// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";

const repo = vi.hoisted(() => ({ reschedule: vi.fn<(id: string, day: unknown) => Promise<undefined>>(async () => undefined), setState: vi.fn(async () => undefined), reopen: vi.fn(async () => undefined) }));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => repo }));

const { HitActions } = await import("./hit-actions");

const today = localDate("2026-10-07");
const hit = (state: Task["state"], doDate: string | null = null) => ({ id: "t1", state, doDate: doDate ? localDate(doDate) : null }) as Pick<Task, "id" | "state" | "doDate">;
const names = () => screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<HitActions>", () => {
  it("draws what the task's own list offers, in its order", () => {
    const cases: [Task["state"], string | null, string[]][] = [
      ["inbox", null, ["Today", "Tomorrow", "Someday", "Drop"]],
      ["active", "2026-10-05", ["Today", "Tomorrow", "Someday", "Drop"]],
      ["active", "2026-10-07", ["Tomorrow"]],
      ["someday", null, ["Today", "Drop"]],
      ["done", null, ["Reopen"]],
      ["dropped", null, ["Restore"]],
      ["archived", null, []],
    ];
    for (const [state, doDate, want] of cases) {
      render(<HitActions task={hit(state, doDate)} today={today} />);
      expect(names()).toEqual(want);
      cleanup();
    }
  });

  it("each is one write", async () => {
    const user = userEvent.setup();
    render(<HitActions task={hit("active", "2026-10-07")} today={today} />);
    await user.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(String(repo.reschedule.mock.lastCall?.[1])).toBe("2026-10-08");
    cleanup();
    render(<HitActions task={hit("dropped")} today={today} />);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(repo.setState).toHaveBeenLastCalledWith("t1", "active", "Brought back {title}");
    cleanup();
    render(<HitActions task={hit("done")} today={today} />);
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(repo.reopen).toHaveBeenLastCalledWith("t1");
  });
});
