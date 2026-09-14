import { describe, expect, it } from "vitest";
import { pop, push, type UndoEntry } from "./undo-stack";

const entry = (label: string): UndoEntry => ({ label, toast: true, undo: async () => {} });

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
