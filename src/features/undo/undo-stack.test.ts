import { describe, expect, it, vi } from "vitest";
import { UndoHistory, pop, push, type Redo, type UndoEntry } from "./undo-stack";
import { valueEntry } from "./value-entry";

const entry = (label: string): UndoEntry => ({ label, toast: true, undo: async () => {} });

/** An entry over one value: its undo hands back a redo, as a repository's record does once it is redoable. */
function counter(log: string[], label: string): UndoEntry {
  const again: Redo = { redo: async () => void log.push(`redo ${label}`), undo: async () => void log.push(`undo ${label}`) };
  return {
    label,
    toast: false,
    undo: async () => {
      log.push(`undo ${label}`);
      return again;
    },
  };
}

describe("undo stack", () => {
  it("pushes to the top and pops the latest", () => {
    const s = push(push([], entry("a")), entry("b"));
    const { entry: top, rest } = pop(s);
    expect(top?.label).toBe("b");
    expect(rest.map((e) => e.label)).toEqual(["a"]);
    expect(pop([]).entry).toBeNull();
  });

  it("keeps only the most recent entries", () => {
    let s: UndoEntry[] = [];
    for (let i = 0; i < 25; i++) s = push(s, entry(String(i)));
    expect(s).toHaveLength(20);
    expect(s[0].label).toBe("5");
    expect(push([entry("x")], entry("y"), 1).map((e) => e.label)).toEqual(["y"]);
  });
});

describe("UndoHistory: undo and redo", () => {
  it("undo hands the entry to the redo stack; redo makes it again and puts it back, in order, as often as asked", async () => {
    const log: string[] = [];
    const h = new UndoHistory();
    h.record(counter(log, "a"));
    h.record(counter(log, "b"));
    expect(await h.undo()).toMatchObject({ entry: { label: "b" }, redoable: true });
    expect(await h.undo()).toMatchObject({ entry: { label: "a" }, redoable: true });
    expect(h.canUndo).toBe(false);
    expect((await h.redo())?.label).toBe("a");
    expect((await h.redo())?.label).toBe("b");
    expect(await h.redo()).toBeNull();
    await h.undo();
    await h.redo();
    expect(log).toEqual(["undo b", "undo a", "redo a", "redo b", "undo b", "redo b"]);
  });

  it("a new write clears the redo stack", async () => {
    const h = new UndoHistory();
    h.record(counter([], "a"));
    await h.undo();
    expect(h.canRedo).toBe(true);
    h.record(counter([], "b"));
    expect(h.canRedo).toBe(false);
    expect(await h.redo()).toBeNull();
  });

  it("the redo stack is as deep as the undo stack: twenty", async () => {
    const log: string[] = [];
    const h = new UndoHistory();
    for (let i = 0; i < 25; i++) h.record(counter(log, String(i)));
    let undone = 0;
    while (await h.undo()) undone++;
    expect(undone).toBe(20);
    let redone = 0;
    while (await h.redo()) redone++;
    expect(redone).toBe(20);
    expect(log.at(-1)).toBe("redo 24");
  });

  it("an entry that cannot be redone clears the redo stack: nothing older is made again on top of it", async () => {
    const h = new UndoHistory();
    h.record(entry("old, not redoable"));
    h.record(counter([], "new"));
    await h.undo();
    expect(h.canRedo).toBe(true);
    expect(await h.undo()).toMatchObject({ redoable: false });
    expect(h.canRedo).toBe(false);
  });

  it("an undo overtaken by a write while it ran leaves nothing to redo", async () => {
    const h = new UndoHistory();
    let finish = () => {};
    h.record({ label: "slow", toast: false, undo: () => new Promise<Redo>((resolve) => (finish = () => resolve({ redo: async () => {}, undo: async () => {} }))) });
    const undoing = h.undo();
    await Promise.resolve();
    h.record(entry("newer"));
    finish();
    expect(await undoing).toMatchObject({ redoable: false });
    expect(h.canRedo).toBe(false);
  });

  it("undo and redo run one at a time, in the order asked", async () => {
    const order: string[] = [];
    const h = new UndoHistory();
    const slow = (label: string, ms: number): UndoEntry => ({
      label,
      toast: false,
      undo: () =>
        new Promise<undefined>((resolve) =>
          setTimeout(() => {
            order.push(label);
            resolve(undefined);
          }, ms),
        ),
    });
    h.record(slow("a", 1));
    h.record(slow("b", 20));
    await Promise.all([h.undo(), h.undo()]);
    expect(order).toEqual(["b", "a"]);
  });

  it("tells its listener whenever either stack changes", async () => {
    const changed = vi.fn();
    const h = new UndoHistory(changed);
    h.record(counter([], "a"));
    expect(changed).toHaveBeenLastCalledWith(h);
    await h.undo();
    expect(h.canRedo).toBe(true);
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("valueEntry", () => {
  it("undo writes the old value over the new one, redo the new one over the old, as often as asked", async () => {
    const write = vi.fn();
    const h = new UndoHistory();
    h.record(valueEntry("Changed a setting", write, { theme: "light" }, { theme: "dark" }));
    await h.undo();
    await h.redo();
    await h.undo();
    expect(write.mock.calls).toEqual([
      [{ theme: "light" }, { theme: "dark" }],
      [{ theme: "dark" }, { theme: "light" }],
      [{ theme: "light" }, { theme: "dark" }],
    ]);
  });
});
