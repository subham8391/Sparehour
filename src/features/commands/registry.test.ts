import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { parseShortcut, resolveKey } from "./keys";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";

type Mocked = { update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn>; completeMany: ReturnType<typeof vi.fn>; setState: ReturnType<typeof vi.fn>; setStateMany: ReturnType<typeof vi.fn> };

function ctxWith(over: Partial<CommandContext> = {}): CommandContext & { tasks: Mocked } {
  const tasks: Mocked = { update: vi.fn(), updateMany: vi.fn(), complete: vi.fn(), completeMany: vi.fn(), setState: vi.fn(), setStateMany: vi.fn() };
  return {
    selectedTaskId: "t1",
    checkedTaskIds: [],
    toggleCheck: vi.fn(),
    checkAll: vi.fn(),
    clearChecks: vi.fn(),
    pathname: "/today",
    today: localDate("2026-09-14"),
    now: instant("2026-09-14T08:03:00Z"),
    zone: "Europe/London",
    tasks: tasks as unknown as TaskRepo,
    go: vi.fn(),
    quickAdd: vi.fn(),
    openTask: vi.fn(),
    moveSelection: vi.fn(),
    openPalette: vi.fn(),
    openShortcuts: vi.fn(),
    setTheme: vi.fn(),
    undo: vi.fn(),
    blockTask: vi.fn(),
    planDay: vi.fn(),
    ...over,
    // keep the typed mocks reachable
    ...({} as object),
  } as CommandContext & { tasks: typeof tasks };
}

const byId = (id: string) => {
  const c = COMMANDS.find((c) => c.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

describe("command registry", () => {
  it("every shortcut parses and no two commands share one", () => {
    const seen = new Map<string, string>();
    for (const b of keyBindings()) {
      expect(parseShortcut(b.shortcut).length).toBeGreaterThan(0);
      const key = parseShortcut(b.shortcut)
        .map((c) => `${c.mod ? "mod+" : ""}${c.shift ? "shift+" : ""}${c.key}`)
        .join(" ");
      expect(seen.get(key), `${b.value.id} and ${seen.get(key)} both use ${b.shortcut}`).toBeUndefined();
      seen.set(key, b.value.id);
    }
  });

  it("the keys from the spec's map resolve to the right commands", () => {
    const bindings = keyBindings();
    const chord = (key: string, shift = false, mod = false) => ({ key, shift, mod, alt: false });
    expect(resolveKey(chord("t"), null, bindings).match?.id).toBe("task.today");
    expect(resolveKey(chord("t", true), null, bindings).match?.id).toBe("task.tomorrow");
    expect(resolveKey(chord("e", true), null, bindings).match?.id).toBe("task.evening");
    expect(resolveKey(chord("s"), null, bindings).match?.id).toBe("task.someday");
    expect(resolveKey(chord("1"), null, bindings).match?.id).toBe("task.priority1");
    expect(resolveKey(chord("enter", false, true), null, bindings).match?.id).toBe("task.complete");
    expect(resolveKey(chord("k", false, true), null, bindings).match?.id).toBe("app.palette");
    const g = resolveKey(chord("g"), null, bindings);
    expect(resolveKey(chord("l"), g.pending, bindings).match?.id).toBe("go.logbook");
  });

  it("selected-task commands act on the selection through the repository", async () => {
    const ctx = ctxWith();
    await byId("task.today").run(ctx);
    expect(ctx.tasks.update).toHaveBeenCalledWith("t1", { doDate: ctx.today, doTime: null, evening: false }, "Moved {title} to today");
    await byId("task.tomorrow").run(ctx);
    expect((ctx.tasks.update.mock.lastCall?.[1] as { doDate: { toString(): string } }).doDate.toString()).toBe("2026-09-15");
    await byId("task.evening").run(ctx);
    expect(ctx.tasks.update.mock.lastCall?.[1]).toMatchObject({ evening: true });
    await byId("task.priority1").run(ctx);
    expect(ctx.tasks.update).toHaveBeenLastCalledWith("t1", { priority: 3 });
    await byId("task.complete").run(ctx);
    expect(ctx.tasks.complete).toHaveBeenCalledWith("t1");
    await byId("task.someday").run(ctx);
    expect(ctx.tasks.setState).toHaveBeenCalledWith("t1", "someday");
    await byId("task.open").run(ctx);
    expect(ctx.openTask).toHaveBeenCalledWith("t1");
    await byId("task.block").run(ctx);
    expect(ctx.blockTask).toHaveBeenCalledWith("t1");
    expect(resolveKey({ key: "b", shift: false, mod: false, alt: false }, null, keyBindings()).match?.id).toBe("task.block");
  });

  it("Cmd+Shift+P plans the day, and the palette offers the re-plan, with nothing selected", async () => {
    expect(resolveKey({ key: "p", shift: true, mod: true, alt: false }, null, keyBindings()).match?.id).toBe("day.plan-my-day");
    const ctx = ctxWith({ selectedTaskId: null });
    await byId("day.plan-my-day").run(ctx);
    expect(ctx.planDay).toHaveBeenLastCalledWith("plan");
    await byId("day.replan").run(ctx);
    expect(ctx.planDay).toHaveBeenLastCalledWith("replan");
    expect(availability(byId("day.replan"), ctx)).toEqual({ enabled: true });
    expect(byId("day.plan-my-day").title).toBe("Plan my day");
    expect(byId("day.replan").title).toBe("Re-plan the rest of today");
  });

  it("does nothing without a selection, and says why", async () => {
    const ctx = ctxWith({ selectedTaskId: null });
    await byId("task.today").run(ctx);
    expect(ctx.tasks.update).not.toHaveBeenCalled();
    expect(availability(byId("task.today"), ctx)).toEqual({ enabled: false, reason: "select a task first" });
    expect(availability(byId("go.inbox"), ctx)).toEqual({ enabled: true });
  });

  it("with rows ticked, the edits go to all of them in one bulk write; open and the pickers keep to the selection", async () => {
    const ctx = ctxWith({ selectedTaskId: "t1", checkedTaskIds: ["t2", "t3"] });
    expect(availability(byId("task.today"), { selectedTaskId: null, checkedTaskIds: ["t2"] })).toEqual({ enabled: true });
    await byId("task.today").run(ctx);
    expect(ctx.tasks.updateMany).toHaveBeenCalledWith(["t2", "t3"], { doDate: ctx.today, doTime: null, evening: false }, "Moved {title} to today");
    expect(ctx.tasks.update).not.toHaveBeenCalled();
    await byId("task.tomorrow").run(ctx);
    expect(ctx.tasks.updateMany.mock.lastCall?.[2]).toBe("Moved {title} to tomorrow");
    await byId("task.priority2").run(ctx);
    expect(ctx.tasks.updateMany).toHaveBeenLastCalledWith(["t2", "t3"], { priority: 2 });
    await byId("task.complete").run(ctx);
    expect(ctx.tasks.completeMany).toHaveBeenCalledWith(["t2", "t3"]);
    await byId("task.someday").run(ctx);
    expect(ctx.tasks.setStateMany).toHaveBeenCalledWith(["t2", "t3"], "someday");
    await byId("task.drop").run(ctx);
    expect(ctx.tasks.setStateMany).toHaveBeenLastCalledWith(["t2", "t3"], "dropped");
    await byId("task.open").run(ctx);
    expect(ctx.openTask).toHaveBeenCalledWith("t1");
    // A single ticked row takes the single-row path, so its toast names the task.
    const one = ctxWith({ selectedTaskId: null, checkedTaskIds: ["t2"] });
    await byId("task.drop").run(one);
    expect(one.tasks.setState).toHaveBeenCalledWith("t2", "dropped");
  });

  it("X ticks the selected row, Cmd+A ticks the view, and the clear command empties it", () => {
    const ctx = ctxWith();
    byId("list.check").run(ctx);
    expect(ctx.toggleCheck).toHaveBeenCalledWith("t1");
    byId("list.check-all").run(ctx);
    expect(ctx.checkAll).toHaveBeenCalled();
    byId("list.clear-checks").run(ctx);
    expect(ctx.clearChecks).toHaveBeenCalled();
    const bindings = keyBindings();
    expect(resolveKey({ key: "x", shift: false, mod: false, alt: false }, null, bindings).match?.id).toBe("list.check");
    expect(resolveKey({ key: "a", shift: false, mod: true, alt: false }, null, bindings).match?.id).toBe("list.check-all");
  });

  it("navigation and app commands reach their targets", () => {
    const ctx = ctxWith();
    byId("go.inbox").run(ctx);
    expect(ctx.go).toHaveBeenCalledWith("/inbox");
    byId("create.task").run(ctx);
    expect(ctx.quickAdd).toHaveBeenCalled();
    byId("list.down").run(ctx);
    expect(ctx.moveSelection).toHaveBeenCalledWith(1);
    byId("view.theme-dark").run(ctx);
    expect(ctx.setTheme).toHaveBeenCalledWith("dark");
    byId("app.shortcuts").run(ctx);
    expect(ctx.openShortcuts).toHaveBeenCalled();
  });
});
