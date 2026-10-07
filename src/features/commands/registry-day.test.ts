// @vitest-environment jsdom
// The palette's Day group and the keys that step Today (SCREENS.md §12 Day, §24): Go to tomorrow, Go to yesterday,
// Jump to date, `[` / `]`, `T` with nothing selected, and `N` on a day Today was stepped to.
import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { registerTodayHandler, resetTodayRequests } from "@/features/today/today-request";
import { COMMANDS, GROUP_ORDER, keyBindings, prefillHere, type CommandContext } from "./registry";
import { registerViewKeys } from "./view-keys";

const byId = (id: string) => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    selectedTaskId: null,
    checkedTaskIds: [],
    toggleCheck: vi.fn(),
    checkAll: vi.fn(),
    clearChecks: vi.fn(),
    pathname: "/inbox",
    today: localDate("2026-10-07"),
    now: instant("2026-10-07T08:00:00Z"),
    zone: "UTC",
    tasks: { update: vi.fn(async () => {}), updateMany: vi.fn(async () => {}) } as unknown as TaskRepo,
    go: vi.fn(),
    quickAdd: vi.fn(),
    openTask: vi.fn(),
    editTicked: vi.fn(),
    moveSelection: vi.fn(),
    openPalette: vi.fn(),
    openShortcuts: vi.fn(),
    setTheme: vi.fn(),
    undo: vi.fn(),
    blockTask: vi.fn(),
    planDay: vi.fn(),
    taskState: vi.fn(async () => "active"),
    projectName: vi.fn(async () => null),
    ...over,
  };
}

afterEach(() => {
  resetTodayRequests();
  window.history.replaceState(null, "", "/");
});

describe("the Day group", () => {
  it("lists the rituals and the days together, after Go to", () => {
    expect(GROUP_ORDER.indexOf("Day")).toBe(GROUP_ORDER.indexOf("Go to") + 1);
    const day = COMMANDS.filter((c) => c.group === "Day").map((c) => c.title);
    expect(day).toEqual(expect.arrayContaining(["Start morning plan", "Start evening shutdown", "Trim today…", "Go to tomorrow", "Go to yesterday", "Jump to date…"]));
  });

  it("Go to tomorrow and Go to yesterday open Today on that day, from anywhere", async () => {
    const away = ctx();
    await byId("day.tomorrow").run(away);
    expect(away.go).toHaveBeenCalledWith("/today?day=2026-10-08");
    await byId("day.yesterday").run(away);
    expect(away.go).toHaveBeenCalledWith("/today?day=2026-10-06");
  });

  it("on Today only the address changes, so the page follows without a navigation", async () => {
    window.history.replaceState(null, "", "/today");
    const here = ctx({ pathname: "/today" });
    await byId("day.tomorrow").run(here);
    expect(here.go).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?day=2026-10-08");
  });

  it("Jump to date opens on Today, at once or as soon as Today is open", () => {
    const away = ctx();
    void byId("day.jump").run(away);
    expect(away.go).toHaveBeenCalledWith("/today");
    const handler = vi.fn();
    registerTodayHandler(handler);
    expect(handler).toHaveBeenCalledWith({ kind: "jump" });
    const here = ctx({ pathname: "/today" });
    void byId("day.jump").run(here);
    expect(here.go).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("the keys", () => {
  const binding = (key: string) => keyBindings().find((b) => b.shortcut === key)?.value;

  it("[ and ] step the view on screen; with no view to take them they type, as unbound keys do", () => {
    const prev = binding("[");
    const next = binding("]");
    expect(prev?.passes?.(ctx())).toBe(true);
    const handlers = { prev: vi.fn(), next: vi.fn() };
    const off = registerViewKeys(handlers);
    expect(next?.passes?.(ctx({ pathname: "/today" }))).toBe(false);
    void prev?.run(ctx({ pathname: "/today" }));
    void next?.run(ctx({ pathname: "/today" }));
    expect(handlers.prev).toHaveBeenCalled();
    expect(handlers.next).toHaveBeenCalled();
    off();
  });

  it("T with nothing selected goes home; with a selection it still moves the task to today", async () => {
    const home = vi.fn(() => true);
    const off = registerViewKeys({ home });
    const t = byId("task.today");
    t.unselected?.(ctx({ pathname: "/today" }));
    expect(home).toHaveBeenCalled();
    const c = ctx({ pathname: "/today", selectedTaskId: "t1" });
    await t.run(c);
    expect(c.tasks.update).toHaveBeenCalledWith("t1", expect.objectContaining({ doDate: c.today }), "Moved {title} to today");
    off();
  });

  it("N on Today files the new task on the day shown", async () => {
    window.history.replaceState(null, "", "/today");
    expect(await prefillHere(ctx({ pathname: "/today" }))).toBe("today ");
    window.history.replaceState(null, "", "/today?day=2026-10-08");
    expect(await prefillHere(ctx({ pathname: "/today" }))).toBe("tomorrow ");
    window.history.replaceState(null, "", "/today?day=2026-10-13");
    expect(await prefillHere(ctx({ pathname: "/today" }))).toBe("13 oct ");
  });
});
