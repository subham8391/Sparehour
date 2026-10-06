import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { resolveKey } from "./keys";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";
import { registerViewKeys, runViewKey, type ViewKeyHandlers } from "./view-keys";

const ctx = (over: Partial<CommandContext> = {}): CommandContext =>
  ({
    selectedTaskId: null,
    checkedTaskIds: [],
    pathname: "/upcoming",
    today: localDate("2026-10-06"),
    now: instant("2026-10-06T09:00:00Z"),
    zone: "Europe/London",
    tasks: { update: vi.fn(), updateMany: vi.fn() } as unknown as TaskRepo,
    moveSelection: vi.fn(),
    ...over,
  }) as CommandContext;
const byId = (id: string) => COMMANDS.find((c) => c.id === id)!;
/** What the keyboard layer does with a command: run it when it applies, else its no-selection meaning. */
const press = (id: string, c: CommandContext) => {
  const command = byId(id);
  if (availability(command, c).enabled) return command.run(c);
  command.unselected?.(c);
};

let cleanup: (() => void) | null = null;
const register = (h: ViewKeyHandlers) => {
  cleanup = registerViewKeys(h);
};
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("keys a view gives a meaning", () => {
  it("[ ] ← → reach the bindings", () => {
    const chord = (key: string) => ({ key, shift: false, mod: false, alt: false });
    const bindings = keyBindings();
    expect(resolveKey(chord("["), null, bindings).match?.id).toBe("view.prev");
    expect(resolveKey(chord("]"), null, bindings).match?.id).toBe("view.next");
    expect(resolveKey(chord("arrowleft"), null, bindings).match?.id).toBe("task.day-earlier");
    expect(resolveKey(chord("arrowright"), null, bindings).match?.id).toBe("task.day-later");
  });

  it("do nothing where no view registered them, and J/K walk the list as before", () => {
    const c = ctx({ selectedTaskId: "t1" });
    expect(runViewKey("next", null)).toBe(false);
    press("view.next", c);
    press("task.day-later", c);
    press("list.down", c);
    expect(c.moveSelection).toHaveBeenCalledWith(1);
  });

  it("[ and ] step the view; T with nothing selected brings it home, with a selection it still moves the task", () => {
    const h = { prev: vi.fn(), next: vi.fn(), home: vi.fn() };
    register(h);
    press("view.prev", ctx());
    press("view.next", ctx());
    expect(h.prev).toHaveBeenCalledTimes(1);
    expect(h.next).toHaveBeenCalledTimes(1);

    press("task.today", ctx());
    expect(h.home).toHaveBeenCalledTimes(1);
    const selected = ctx({ selectedTaskId: "t1" });
    press("task.today", selected);
    expect(h.home).toHaveBeenCalledTimes(1);
    expect(selected.tasks.update).toHaveBeenCalledWith("t1", { doDate: localDate("2026-10-06"), doTime: null, evening: false }, "Moved {title} to today");
  });

  it("← / → hand the selected task to the view, and need one", () => {
    const h = { earlier: vi.fn(), later: vi.fn() };
    register(h);
    press("task.day-later", ctx({ selectedTaskId: "t1" }));
    press("task.day-earlier", ctx({ selectedTaskId: "t2" }));
    press("task.day-later", ctx());
    expect(h.later.mock.calls).toEqual([["t1"]]);
    expect(h.earlier.mock.calls).toEqual([["t2"]]);
  });

  it("J / K go to the view first and fall back to the list when it lets the key pass", () => {
    const down = vi.fn<(id: string | null) => boolean>(() => true);
    register({ down, up: () => false });
    const c = ctx({ selectedTaskId: "a1" });
    press("list.down", c);
    expect(down).toHaveBeenCalledWith("a1");
    expect(c.moveSelection).not.toHaveBeenCalled();
    press("list.up", c);
    expect(c.moveSelection).toHaveBeenCalledWith(-1);
  });

  it("a view's handlers leave with it", () => {
    const h = { next: vi.fn() };
    const off = registerViewKeys(h);
    off();
    expect(runViewKey("next", null)).toBe(false);
    expect(h.next).not.toHaveBeenCalled();
  });
});
