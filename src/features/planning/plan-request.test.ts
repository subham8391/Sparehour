import { afterEach, describe, expect, it, vi } from "vitest";
import { planMode, sameDrawing } from "./drawing";
import { registerPlanHandler, requestPlan, resetPlanRequests } from "./plan-request";

afterEach(() => resetPlanRequests());

describe("plan requests", () => {
  it("a screen that can preview takes the request at once", () => {
    const h = vi.fn();
    const off = registerPlanHandler(h);
    expect(requestPlan("replan")).toBe(true);
    expect(h).toHaveBeenCalledWith("replan");
    off();
    expect(requestPlan("plan")).toBe(false);
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("a request made elsewhere waits for the screen, and is handed over once", () => {
    expect(requestPlan("plan")).toBe(false);
    const h = vi.fn();
    registerPlanHandler(h);
    expect(h).toHaveBeenCalledWith("plan");
    const later = vi.fn();
    registerPlanHandler(later);
    expect(later).not.toHaveBeenCalled();
  });

  it("an old screen's cleanup never unregisters the new one", () => {
    const first = vi.fn();
    const offFirst = registerPlanHandler(first);
    const second = vi.fn();
    registerPlanHandler(second);
    offFirst();
    requestPlan("plan");
    expect(second).toHaveBeenCalledWith("plan");
    expect(first).not.toHaveBeenCalled();
  });
});

describe("the header button", () => {
  it("re-plans once the day has started and the plan has blocks on it", () => {
    expect(planMode(8 * 60, 9 * 60, true)).toBe("plan");
    expect(planMode(10 * 60, 9 * 60, false)).toBe("plan");
    expect(planMode(10 * 60, 9 * 60, true)).toBe("replan");
  });

  it("treats two drawings that paint the same as the same", () => {
    const a = { ghosts: [{ key: "t1", title: "Draft", start: 540, end: 585 }], free: [{ start: 585, end: 600 }], replacedIds: [] };
    expect(sameDrawing(a, { ...a, ghosts: [...a.ghosts] })).toBe(true);
    expect(sameDrawing(a, { ...a, replacedIds: ["b1"] })).toBe(false);
    expect(sameDrawing(null, null)).toBe(true);
  });
});
