// The palette's Convert to project, Trim today, Sort by… and Show completed (SCREENS.md §12; DECISIONS.md
// "Sort", 2026-10-06: Today only).
import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { registerTodayHandler, resetTodayRequests } from "@/features/today/today-request";
import { COMMANDS, availability, type CommandContext } from "./registry";

const byId = (id: string) => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    selectedTaskId: "t1",
    checkedTaskIds: [],
    toggleCheck: vi.fn(),
    checkAll: vi.fn(),
    clearChecks: vi.fn(),
    pathname: "/today",
    today: localDate("2026-10-06"),
    now: instant("2026-10-06T08:00:00Z"),
    zone: "Europe/London",
    tasks: { convertToProject: vi.fn(async () => ({ projectId: "p9", taskIds: [] })) } as unknown as TaskRepo,
    go: vi.fn(),
    quickAdd: vi.fn(),
    openTask: vi.fn(),
    editTicked: vi.fn(),
    moveSelection: vi.fn(),
    openPalette: vi.fn(),
    openShortcuts: vi.fn(),
    setTheme: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canRedo: false,
    blockTask: vi.fn(),
    planDay: vi.fn(),
    taskState: vi.fn(async () => "active"),
    projectName: vi.fn(async () => null),
    ...over,
  };
}

afterEach(() => resetTodayRequests());

describe("Convert to project", () => {
  it("converts the selected task and opens the project with the cursor in its add row", async () => {
    const c = ctx();
    await byId("task.convert").run(c);
    expect(c.tasks.convertToProject).toHaveBeenCalledWith("t1");
    expect(c.go).toHaveBeenCalledWith("/project/p9?add=1");
    expect(availability(byId("task.convert"), { ...c, selectedTaskId: null })).toEqual({ enabled: false, reason: "select a task first" });
  });

  it("a task that cannot be converted stays where it is", async () => {
    const c = ctx({ tasks: { convertToProject: vi.fn(async () => null) } as unknown as TaskRepo });
    await byId("task.convert").run(c);
    expect(c.go).not.toHaveBeenCalled();
  });
});

describe("Today's view commands", () => {
  it("Sort by… and Show completed are enabled on Today only", () => {
    for (const id of ["view.sort", "view.sort-time", "view.sort-manual", "view.show-completed"]) {
      expect(availability(byId(id), ctx())).toEqual({ enabled: true });
      expect(availability(byId(id), ctx({ pathname: "/inbox" }))).toEqual({ enabled: false, reason: "on Today" });
    }
    expect(COMMANDS.filter((c) => c.id.startsWith("view.sort-")).map((c) => c.title)).toEqual([
      "Sort Today by hand (Manual)",
      "Sort Today by time",
      "Sort Today by priority",
      "Sort Today by deadline",
      "Sort Today by estimate",
    ]);
  });

  it("Sort by… types the five sorts' prefix into the palette, which stays open on them", () => {
    expect(byId("view.sort").fill).toBe("Sort Today by ");
    const sorts = COMMANDS.filter((c) => c.title.startsWith(byId("view.sort").fill!));
    expect(sorts).toHaveLength(5);
  });

  it("a sort and Show completed go to Today", () => {
    const handler = vi.fn();
    registerTodayHandler(handler);
    void byId("view.sort-priority").run(ctx());
    void byId("view.show-completed").run(ctx());
    expect(handler.mock.calls.map((x) => x[0])).toEqual([{ kind: "sort", sort: "priority" }, { kind: "completed" }]);
  });

  it("Trim today opens the panel on Today, or goes to Today and opens it there", () => {
    const away = ctx({ pathname: "/inbox" });
    void byId("day.trim").run(away);
    expect(away.go).toHaveBeenCalledWith("/today");
    const handler = vi.fn();
    registerTodayHandler(handler);
    expect(handler).toHaveBeenCalledWith({ kind: "trim" });
    const here = ctx();
    void byId("day.trim").run(here);
    expect(here.go).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
