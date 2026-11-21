import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { readout } from "./morning-plan";
import { PLAN_STEP_LABELS, PLAN_TITLES, eveningNote, overLead, pickSummary, primaryLabel, spareFigure, toBlockTasks, toBlockWords } from "./morning-plan-words";

const TODAY = localDate("2026-11-18");
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, state: "active", doDate: TODAY, evening: false, estimateMin: 30, deadline: null, ...over }) as unknown as Task;

describe("the morning plan's words", () => {
  it("names the three steps in order, and each step's one action", () => {
    expect(PLAN_STEP_LABELS).toEqual(["Here’s your day", "Pick today’s tasks", "Block time"]);
    expect(PLAN_TITLES.pick).toBe("Pick today’s tasks");
    expect([primaryLabel("frame"), primaryLabel("pick"), primaryLabel("block")]).toEqual(["Next", "Next · Block time", "Done"]);
  });

  it("the pinned summary says what fits, what is picked and how many, led by the overage when over", () => {
    const fits = readout([task("a"), task("b", { estimateMin: 60 })], 120, 30);
    expect(pickSummary(fits)).toBe("2h fits today · 1h 30m picked · 2 tasks");
    expect(overLead(fits)).toBe("");
    const over = readout([task("a", { estimateMin: 150 })], 120, 30);
    expect(`${overLead(over)}${pickSummary(over)}`).toBe("30m over · 2h fits today · 2h 30m picked · 1 task");
  });

  it("the evening note names the evening's total and when it starts, or leaves both out", () => {
    expect(eveningNote([task("a")], 30, 18 * 60)).toBe("Evening tasks aren’t counted here — they get their own time after work.");
    expect(eveningNote([task("a", { evening: true, estimateMin: null }), task("b", { evening: true, estimateMin: 20 })], 30, 18 * 60)).toBe("Evening tasks aren’t counted here — they get their own 50m after 18:00.");
    expect(eveningNote([task("a", { evening: true })], 30, null)).toBe("Evening tasks aren’t counted here — they get their own time after work.");
  });

  it("step 3 lists the picked daytime tasks that have no block yet", () => {
    const tasks = [task("a"), task("b"), task("c", { evening: true })];
    expect(toBlockTasks(tasks, [{ taskId: "a" }, { taskId: null }]).map((t) => t.id)).toEqual(["b"]);
    expect(toBlockTasks(tasks, []).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("step 3's line says what is spare or over, and how many still want a time", () => {
    expect(spareFigure(200)).toBe("3h 20m spare");
    expect(spareFigure(-40)).toBe("40m over");
    expect(toBlockWords(0)).toBe("everything picked has a time");
    expect(toBlockWords(2)).toBe("2 to block");
  });
});
