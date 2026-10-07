import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { parseShortcut, resolveKey } from "./keys";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";

type Mocked = {
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  completeMany: ReturnType<typeof vi.fn>;
  reopen: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  setStateMany: ReturnType<typeof vi.fn>;
};

function ctxWith(over: Partial<CommandContext> = {}): CommandContext & { tasks: Mocked } {
  const tasks: Mocked = { update: vi.fn(), updateMany: vi.fn(), complete: vi.fn(), completeMany: vi.fn(), reopen: vi.fn(), setState: vi.fn(), setStateMany: vi.fn() };
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

  it("D, ⇧D, ⇧S, E and R open their field's picker (SCREENS.md §24), and the palette names them as §12 does", async () => {
    const chord = (key: string, shift = false) => ({ key, shift, mod: false, alt: false });
    const bindings = keyBindings();
    expect(resolveKey(chord("d"), null, bindings).match?.id).toBe("task.do");
    expect(resolveKey(chord("d", true), null, bindings).match?.id).toBe("task.deadline");
    expect(resolveKey(chord("s", true), null, bindings).match?.id).toBe("task.start");
    expect(resolveKey(chord("s"), null, bindings).match?.id).toBe("task.someday");
    expect(resolveKey(chord("e"), null, bindings).match?.id).toBe("task.estimate");
    expect(resolveKey(chord("r"), null, bindings).match?.id).toBe("task.repeat");
    expect(["task.do", "task.deadline", "task.start", "task.estimate", "task.repeat"].map((id) => byId(id).title)).toEqual(["Pick a date", "Set deadline", "Set start date", "Set estimate", "Repeat"]);

    const ctx = ctxWith();
    for (const [id, field] of [["task.do", "do"], ["task.deadline", "deadline"], ["task.start", "start"], ["task.estimate", "estimate"], ["task.repeat", "repeat"]] as const) {
      await byId(id).run(ctx);
      expect(ctx.openTask).toHaveBeenLastCalledWith("t1", field);
    }
    expect(availability(byId("task.start"), ctxWith({ selectedTaskId: null }))).toEqual({ enabled: false, reason: "select a task first" });
  });

  it("a repeat's series edits: skip and resume go through the series repository, pause opens its picker", async () => {
    const series = { skip: vi.fn(), resume: vi.fn() };
    const ctx = ctxWith();
    (ctx.tasks as unknown as { series: () => Promise<typeof series> }).series = vi.fn(async () => series);
    expect(["task.skip-occurrence", "task.pause-repeats", "task.resume-repeats"].map((id) => byId(id).title)).toEqual(["Skip this occurrence", "Pause repeats until…", "Resume repeats"]);
    await byId("task.skip-occurrence").run(ctx);
    expect(series.skip).toHaveBeenCalledWith("t1");
    await byId("task.resume-repeats").run(ctx);
    expect(series.resume).toHaveBeenCalledWith("t1");
    await byId("task.pause-repeats").run(ctx);
    expect(ctx.openTask).toHaveBeenLastCalledWith("t1", "pause");
    // Named apart from the If missed → Skip policy, and needing a task.
    expect(availability(byId("task.skip-occurrence"), { selectedTaskId: null, checkedTaskIds: [] }).enabled).toBe(false);
  });

  it("with several rows ticked, D, ⇧D, ⇧S and E open one picker for all of them; one ticked row opens in the detail", async () => {
    const ctx = ctxWith({ selectedTaskId: "t1", checkedTaskIds: ["t2", "t3"] });
    await byId("task.do").run(ctx);
    expect(ctx.editTicked).toHaveBeenLastCalledWith("do");
    await byId("task.deadline").run(ctx);
    expect(ctx.editTicked).toHaveBeenLastCalledWith("deadline");
    await byId("task.estimate").run(ctx);
    expect(ctx.editTicked).toHaveBeenLastCalledWith("estimate");
    expect(ctx.openTask).not.toHaveBeenCalled();
    // A rule is set one task at a time.
    await byId("task.repeat").run(ctx);
    expect(ctx.openTask).toHaveBeenLastCalledWith("t1", "repeat");
    const one = ctxWith({ selectedTaskId: null, checkedTaskIds: ["t2"] });
    await byId("task.start").run(one);
    expect(one.openTask).toHaveBeenLastCalledWith("t2", "start");
    // R, like the others, takes the one ticked row when nothing is selected.
    await byId("task.repeat").run(one);
    expect(one.openTask).toHaveBeenLastCalledWith("t2", "repeat");
    expect(one.editTicked).not.toHaveBeenCalled();
  });

  it("with rows ticked, the edits go to all of them in one bulk write; open keeps to the selection", async () => {
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

  it("U un-completes the selected task when it is done, and leaves anything else alone", async () => {
    expect(resolveKey({ key: "u", shift: false, mod: false, alt: false }, null, keyBindings()).match?.id).toBe("task.uncomplete");
    expect(byId("task.uncomplete")).toMatchObject({ title: "Un-complete", shortcut: "u", requiresSelection: true });
    const done = ctxWith({ taskState: vi.fn(async () => "done") });
    await byId("task.uncomplete").run(done);
    expect(done.taskState).toHaveBeenCalledWith("t1");
    expect(done.tasks.reopen).toHaveBeenCalledWith("t1");
    // An open task, a dropped one, and a repeat's completion row (not a task here) are not reopened.
    for (const state of ["active", "dropped", null]) {
      const other = ctxWith({ taskState: vi.fn(async () => state) });
      await byId("task.uncomplete").run(other);
      expect(other.tasks.reopen).not.toHaveBeenCalled();
    }
    expect(availability(byId("task.uncomplete"), { selectedTaskId: null, checkedTaskIds: [] })).toEqual({ enabled: false, reason: "select a task first" });
  });

  it("U with rows ticked reopens only the done ones", async () => {
    const states: Record<string, string> = { t2: "done", t3: "active", t4: "done" };
    const ctx = ctxWith({ checkedTaskIds: ["t2", "t3", "t4"], taskState: vi.fn(async (id: string) => states[id] ?? null) });
    await byId("task.uncomplete").run(ctx);
    expect(ctx.tasks.reopen.mock.calls.map((c) => c[0])).toEqual(["t2", "t4"]);
  });

  it("⌘Enter toggles: a done task reopens, an open one completes", async () => {
    const done = ctxWith({ taskState: vi.fn(async () => "done") });
    await byId("task.complete").run(done);
    expect(done.tasks.reopen).toHaveBeenCalledWith("t1");
    expect(done.tasks.complete).not.toHaveBeenCalled();
    const open = ctxWith({ taskState: vi.fn(async () => "active") });
    await byId("task.complete").run(open);
    expect(open.tasks.complete).toHaveBeenCalledWith("t1");
    expect(open.tasks.reopen).not.toHaveBeenCalled();
  });

  it("⌘Enter with mixed ticked rows toggles each: the done ones reopen, the open ones complete together", async () => {
    const states: Record<string, string> = { t2: "done", t3: "active", t4: "inbox", t5: "done" };
    const ctx = ctxWith({ checkedTaskIds: ["t2", "t3", "t4", "t5"], taskState: vi.fn(async (id: string) => states[id] ?? null) });
    await byId("task.complete").run(ctx);
    expect(ctx.tasks.reopen.mock.calls.map((c) => c[0])).toEqual(["t2", "t5"]);
    expect(ctx.tasks.completeMany).toHaveBeenCalledWith(["t3", "t4"]);
    expect(ctx.tasks.complete).not.toHaveBeenCalled();
  });

  it("N files the new task where the person is: the project's token on a project, today on Today, nothing elsewhere", async () => {
    const onProject = ctxWith({ pathname: "/project/p1", projectName: vi.fn(async () => "Acme") });
    await byId("create.task-here").run(onProject);
    expect(onProject.projectName).toHaveBeenCalledWith("p1");
    expect(onProject.quickAdd).toHaveBeenCalledWith("#Acme ");
    const spaced = ctxWith({ pathname: "/project/p2", projectName: vi.fn(async () => "Acme redesign") });
    await byId("create.task-here").run(spaced);
    expect(spaced.quickAdd).toHaveBeenCalledWith('#"Acme redesign" ');
    const today = ctxWith({ pathname: "/today" });
    await byId("create.task-here").run(today);
    expect(today.quickAdd).toHaveBeenCalledWith("today ");
    const inbox = ctxWith({ pathname: "/inbox" });
    await byId("create.task-here").run(inbox);
    expect(inbox.quickAdd).toHaveBeenCalledWith(undefined);
    // A project that is not on this device opens an empty quick-add rather than a wrong token.
    const missing = ctxWith({ pathname: "/project/gone", projectName: vi.fn(async () => null) });
    await byId("create.task-here").run(missing);
    expect(missing.quickAdd).toHaveBeenCalledWith(undefined);
  });

  it("the palette can add a project and an area, through Browse's own forms", async () => {
    const ctx = ctxWith({ selectedTaskId: null });
    expect(byId("create.project")).toMatchObject({ title: "Add project", group: "Create" });
    expect(byId("create.area")).toMatchObject({ title: "Add area", group: "Create" });
    expect(byId("create.project").hidden).toBeFalsy();
    await byId("create.project").run(ctx);
    expect(ctx.go).toHaveBeenLastCalledWith("/browse?add=project");
    await byId("create.area").run(ctx);
    expect(ctx.go).toHaveBeenLastCalledWith("/browse?add=area");
    expect(availability(byId("create.area"), ctx)).toEqual({ enabled: true });
  });
});
