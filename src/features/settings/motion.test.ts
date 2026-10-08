// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_KEY } from "@/features/commands/theme";
import { THEME_BOOTSTRAP } from "@/features/commands/theme-bootstrap";
import { applyMotion, readMotion, subscribeMotion } from "./motion";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.theme;
});

describe("Reduce motion, per device", () => {
  it("Reduce stamps <html> at once and is kept for the next load; System removes both", () => {
    expect(readMotion()).toBe("system");
    const heard = vi.fn();
    const stop = subscribeMotion(heard);
    applyMotion("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(localStorage.getItem(MOTION_KEY)).toBe("reduce");
    expect(readMotion()).toBe("reduce");
    applyMotion("system");
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(localStorage.getItem(MOTION_KEY)).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });

  it("the head script stamps the stored choice before the first paint, theme or no theme", () => {
    localStorage.setItem(MOTION_KEY, "reduce");
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    delete document.documentElement.dataset.motion;
    localStorage.setItem("sparehour.theme", "dark");
    localStorage.removeItem(MOTION_KEY);
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("a change in another tab follows", () => {
    const heard = vi.fn();
    const stop = subscribeMotion(heard);
    window.dispatchEvent(new StorageEvent("storage", { key: MOTION_KEY, newValue: "reduce" }));
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(heard).toHaveBeenCalled();
    stop();
  });
});
