// @vitest-environment jsdom
// Cmd+\ and Cmd+. (SCREENS.md §1, §12 View, §24): the sidebar and the context pane, and why they are off on a phone.
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestToday, registerTodayHandler, resetTodayRequests } from "@/features/today/today-request";
import { chordOf, displayShortcut, parseChord, resolveKey } from "./keys";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";

const byId = (id: string) => COMMANDS.find((c) => c.id === id)!;
const none = { selectedTaskId: null, checkedTaskIds: [] };

/** A viewport `width` px wide, as matchMedia answers min-width queries. */
function viewport(width: number) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: width >= Number(/min-width: (\d+)px/.exec(q)?.[1] ?? Infinity), addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetTodayRequests();
  delete document.documentElement.dataset.sidebar;
  localStorage.clear();
});

describe("Cmd+\\ and Cmd+.", () => {
  it("parse with the backslash and the full stop as keys, apart from `.` alone (the row's menu)", () => {
    expect(parseChord("mod+\\")).toEqual({ key: "\\", shift: false, mod: true, alt: false });
    expect(parseChord("mod+.")).toEqual({ key: ".", shift: false, mod: true, alt: false });
    const bindings = keyBindings();
    const ev = (key: string, metaKey: boolean, ctrlKey = false) => chordOf({ key, shiftKey: false, metaKey, ctrlKey, altKey: false }, true);
    expect(resolveKey(ev("\\", true), null, bindings).match?.id).toBe("view.toggle-sidebar");
    expect(resolveKey(ev(".", true), null, bindings).match?.id).toBe("view.toggle-pane");
    expect(resolveKey(ev(".", false), null, bindings).match?.id).toBe("task.menu");
    // Ctrl on Windows and Linux.
    expect(resolveKey(chordOf({ key: "\\", shiftKey: false, metaKey: false, ctrlKey: true, altKey: false }, false), null, bindings).match?.id).toBe("view.toggle-sidebar");
    expect(displayShortcut("mod+\\", true)).toBe("⌘\\");
    expect(displayShortcut("mod+.", false)).toBe("Ctrl+.");
  });

  it("are the palette's Toggle sidebar and Toggle timeline, in View", () => {
    expect(byId("view.toggle-sidebar")).toMatchObject({ title: "Toggle sidebar", group: "View", shortcut: "mod+\\" });
    expect(byId("view.toggle-pane")).toMatchObject({ title: "Toggle timeline", group: "View", shortcut: "mod+." });
  });

  it("are off with a reason on a phone; the sidebar's needs the medium band, the pane's the narrow one", () => {
    viewport(390);
    expect(availability(byId("view.toggle-sidebar"), none)).toEqual({ enabled: false, reason: "on a wider screen" });
    expect(availability(byId("view.toggle-pane"), none)).toEqual({ enabled: false, reason: "on a wider screen" });
    viewport(820);
    expect(availability(byId("view.toggle-sidebar"), none).enabled).toBe(false);
    expect(availability(byId("view.toggle-pane"), none)).toEqual({ enabled: true });
    viewport(1280);
    expect(availability(byId("view.toggle-sidebar"), none)).toEqual({ enabled: true });
  });

  it("Cmd+\\ folds the sidebar to the rail and back, remembered on this device", () => {
    const run = byId("view.toggle-sidebar").run;
    run({} as CommandContext);
    expect(document.documentElement.dataset.sidebar).toBe("rail");
    expect(localStorage.getItem("sparehour.sidebar")).toBe("rail");
    run({} as CommandContext);
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(localStorage.getItem("sparehour.sidebar")).toBeNull();
  });

  it("Cmd+. hands Today its pane; elsewhere it toggles the task detail", () => {
    const today = vi.fn();
    registerTodayHandler(today);
    const toggleDetail = vi.fn();
    const pane = byId("view.toggle-pane");
    pane.run({ pathname: "/today", toggleDetail } as unknown as CommandContext);
    expect(today).toHaveBeenCalledWith({ kind: "pane" });
    expect(toggleDetail).not.toHaveBeenCalled();
    pane.run({ pathname: "/inbox", toggleDetail } as unknown as CommandContext);
    expect(toggleDetail).toHaveBeenCalledTimes(1);
    expect(today).toHaveBeenCalledTimes(1);
    // Away from Today nothing is left waiting for it.
    resetTodayRequests();
    pane.run({ pathname: "/inbox", toggleDetail } as unknown as CommandContext);
    const later = vi.fn();
    registerTodayHandler(later);
    expect(later).not.toHaveBeenCalled();
    expect(requestToday).toBeTypeOf("function");
  });
});
