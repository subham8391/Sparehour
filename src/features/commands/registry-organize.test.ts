// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { onOrganize, type OrganizeRequest } from "@/features/tasks/organize";
import { resolveKey } from "./keys";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";

function ctxWith(over: Partial<CommandContext> = {}): CommandContext {
  return {
    selectedTaskId: "t1",
    checkedTaskIds: [],
    toggleCheck: vi.fn(),
    checkAll: vi.fn(),
    clearChecks: vi.fn(),
    pathname: "/today",
    today: localDate("2026-10-07"),
    now: instant("2026-10-07T08:00:00Z"),
    zone: "Europe/London",
    tasks: {} as TaskRepo,
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

const byId = (id: string) => {
  const c = COMMANDS.find((c) => c.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

/** Runs a command the way the keyboard layer does: enabled → run, else its unselected meaning. */
const press = async (id: string, ctx: CommandContext) => {
  const c = byId(id);
  if (availability(c, ctx).enabled) await c.run(ctx);
  else c.unselected?.(ctx);
};

describe("organising commands (SCREENS.md §24 #, @, M, G P, G A; §12 Duplicate, Copy link)", () => {
  let requests: OrganizeRequest[];
  let stop: () => void;
  beforeEach(() => {
    requests = [];
    stop = onOrganize((r) => requests.push(r));
  });
  afterEach(() => stop());

  it("#, @ and m are bound, and G P / G A open the palette scoped", () => {
    const chord = (key: string, shift = false) => ({ key, shift, mod: false, alt: false });
    const bindings = keyBindings();
    // Shifted punctuation arrives with shift set; it still matches.
    expect(resolveKey(chord("#", true), null, bindings).match?.id).toBe("task.move-project");
    expect(resolveKey(chord("@", true), null, bindings).match?.id).toBe("task.add-tag");
    expect(resolveKey(chord("m"), null, bindings).match?.id).toBe("task.move");
    const g = resolveKey(chord("g"), null, bindings);
    expect(resolveKey(chord("p"), g.pending, bindings).match?.id).toBe("go.project");
    expect(resolveKey(chord("a"), resolveKey(chord("g"), null, bindings).pending, bindings).match?.id).toBe("go.area");
  });

  it("with a task selected, # opens the move picker for it; with rows ticked, for every ticked row", async () => {
    await press("task.move-project", ctxWith());
    await press("task.move-project", ctxWith({ checkedTaskIds: ["a", "b", "c"] }));
    expect(requests).toEqual([
      { kind: "move", ids: ["t1"], areas: false },
      { kind: "move", ids: ["a", "b", "c"], areas: false },
    ]);
  });

  it("@ opens the tag picker for the targets, and M the move picker with areas", async () => {
    await press("task.add-tag", ctxWith({ checkedTaskIds: ["a", "b"] }));
    await press("task.move", ctxWith());
    expect(requests).toEqual([
      { kind: "tag", ids: ["a", "b"] },
      { kind: "move", ids: ["t1"], areas: true },
    ]);
  });

  it("with nothing selected, #, @ and m open quick-add and type themselves", async () => {
    for (const [id, key] of [
      ["task.move-project", "#"],
      ["task.add-tag", "@"],
      ["task.move", "m"],
    ] as const) {
      const ctx = ctxWith({ selectedTaskId: null });
      await press(id, ctx);
      expect(ctx.quickAdd).toHaveBeenCalledWith(key);
    }
    expect(requests).toEqual([]);
  });

  it("the palette lists Move to project and Add tag, disabled until a task is selected", () => {
    const none = { selectedTaskId: null, checkedTaskIds: [] };
    for (const id of ["task.move-project", "task.add-tag", "task.duplicate", "task.copy-link"]) {
      expect(byId(id).hidden).toBeFalsy();
      expect(availability(byId(id), none)).toEqual({ enabled: false, reason: "select a task first" });
    }
    expect(byId("task.move-project").title).toBe("Move to project");
    expect(byId("task.add-tag").title).toBe("Add tag");
  });

  it("Duplicate asks for a copy of the one task; Duplicate project works on a project page only", async () => {
    await press("task.duplicate", ctxWith());
    expect(availability(byId("project.duplicate"), { selectedTaskId: null, checkedTaskIds: [], pathname: "/today" })).toEqual({ enabled: false, reason: "on a project" });
    expect(availability(byId("project.duplicate"), { selectedTaskId: null, checkedTaskIds: [], pathname: "/project/p%201" }).enabled).toBe(true);
    await press("project.duplicate", ctxWith({ pathname: "/project/p%201" }));
    expect(requests).toEqual([
      { kind: "duplicate", id: "t1" },
      { kind: "duplicate-project", id: "p 1" },
    ]);
  });

  it("Copy link asks for the one task's link", async () => {
    await press("task.copy-link", ctxWith({ selectedTaskId: "t 9" }));
    expect(requests).toEqual([{ kind: "copy-link", id: "t 9" }]);
  });

  it("G P and G A open the palette on projects, or areas", async () => {
    const ctx = ctxWith({ selectedTaskId: null });
    await press("go.project", ctx);
    await press("go.area", ctx);
    expect(ctx.openPalette).toHaveBeenNthCalledWith(1, "", "projects");
    expect(ctx.openPalette).toHaveBeenNthCalledWith(2, "", "areas");
    expect(byId("go.project").group).toBe("Go to");
  });
});

describe("requestOrganize before the island is there", () => {
  it("waits, and the island takes the waiting requests in order once it registers", async () => {
    const { requestOrganize } = await import("@/features/tasks/organize");
    requestOrganize({ kind: "duplicate", id: "x" });
    requestOrganize({ kind: "notice", text: "hi" });
    const got: OrganizeRequest[] = [];
    const stop = onOrganize((r) => got.push(r));
    expect(got).toEqual([
      { kind: "duplicate", id: "x" },
      { kind: "notice", text: "hi" },
    ]);
    stop();
  });
});
