import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { REVIEW_ASK_OPTIONS, REVIEW_OPTIONS, applyReview, choiceLabel, chosenSegment, dayLabel, reviewAskLine, type SheetChoice } from "./carry-review-answers";
import { steppedOffToday } from "./carry-review";

const today = localDate("2026-11-21");
const repo = () => ({
  reschedule: vi.fn(async () => undefined),
  updateMany: vi.fn(async () => undefined),
  setState: vi.fn(async () => undefined),
  setStateMany: vi.fn(async () => undefined),
  convertToProject: vi.fn(async (id: string) => ({ projectId: `p-${id}` })),
});
const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("the review's words", () => {
  it("offers the four moves, and the ask's four in its own order", () => {
    expect(REVIEW_OPTIONS.map((o) => o.label)).toEqual(["Keep", "Tomorrow", "Someday", "Drop"]);
    expect(REVIEW_ASK_OPTIONS.map((o) => o.label)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
  });

  it("names a row's answers, its day and its ask", () => {
    expect(choiceLabel("Call the bank")).toBe("Choice for Call the bank");
    expect(dayLabel("Call the bank")).toBe("Day for Call the bank");
    expect(reviewAskLine(3)).toBe("Carried over 3 times — still want this?");
  });

  it("a picked day leaves every segment unchosen", () => {
    expect(chosenSegment("keep")).toBe("keep");
    expect(chosenSegment("breakdown")).toBe("breakdown");
    expect(chosenSegment({ day: today })).toBe("day");
  });
});

describe("applyReview", () => {
  it("keeps every row that was never touched", async () => {
    const r = repo();
    const out = { project: null };
    await applyReview(r, tasks, new Map(), today, out);
    expect(r.updateMany).toHaveBeenCalledWith(["a", "b", "c", "d"], { doDate: today }, "Moved {title} to today");
    expect(r.convertToProject).not.toHaveBeenCalled();
    expect(out.project).toBeNull();
  });

  it("writes the moves first, then converts each Break it down, and reports the first project made", async () => {
    const r = repo();
    const order: string[] = [];
    r.reschedule.mockImplementation(async () => void order.push("move"));
    r.setState.mockImplementation(async () => void order.push("state"));
    r.convertToProject.mockImplementation(async (id: string) => {
      order.push(`convert ${id}`);
      return { projectId: `p-${id}` };
    });
    const choices = new Map<string, SheetChoice>([
      ["a", "breakdown"],
      ["b", "tomorrow"],
      ["c", "drop"],
      ["d", "breakdown"],
    ]);
    const out: { project: string | null } = { project: null };
    await applyReview(r, tasks, choices, today, out);
    expect(r.reschedule).toHaveBeenCalledWith("b", today.add({ days: 1 }));
    expect(r.setState).toHaveBeenCalledWith("c", "dropped");
    expect(order).toEqual(["move", "state", "convert a", "convert d"]);
    expect(out.project).toBe("p-a");
  });

  it("leaves the first project in reach when a later write fails", async () => {
    const r = repo();
    r.convertToProject.mockImplementationOnce(async (id: string) => ({ projectId: `p-${id}` })).mockImplementationOnce(async () => Promise.reject(new Error("no")));
    const out: { project: string | null } = { project: null };
    await expect(applyReview(r, tasks, new Map<string, SheetChoice>([["a", "breakdown"], ["b", "breakdown"]]), today, out)).rejects.toThrow("no");
    expect(out.project).toBe("p-a");
  });

  it("moves without converting where the repository cannot convert", async () => {
    const full = repo();
    const plain = { reschedule: full.reschedule, updateMany: full.updateMany, setState: full.setState, setStateMany: full.setStateMany };
    const out: { project: string | null } = { project: null };
    await applyReview(plain, [{ id: "a" }], new Map<string, SheetChoice>([["a", "breakdown"]]), today, out);
    expect(plain.reschedule).not.toHaveBeenCalled();
    expect(out.project).toBeNull();
  });
});

describe("steppedOffToday", () => {
  it("is true only while Today shows another day", () => {
    expect(steppedOffToday(true, "2026-11-22", "2026-11-21")).toBe(true);
    expect(steppedOffToday(true, "2026-11-21", "2026-11-21")).toBe(false);
    expect(steppedOffToday(true, null, "2026-11-21")).toBe(false);
    expect(steppedOffToday(true, undefined, "2026-11-21")).toBe(false);
    expect(steppedOffToday(true, "tomorrow", "2026-11-21")).toBe(false);
    expect(steppedOffToday(false, "2026-11-22", "2026-11-21")).toBe(false);
  });
});
