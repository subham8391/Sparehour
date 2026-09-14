import { describe, expect, it } from "vitest";
import { checkAll, checkRange, clearChecks, move, reconcile, select, toggleCheck, type SelectionState } from "./selection";

const ids = ["a", "b", "c"];
const at = (selectedId: string | null, checked: string[] = [], rows = ids): SelectionState => ({ ids: rows, selectedId, checked });

describe("selection", () => {
  it("J from nothing selects the first, K the last, and both stop at the ends", () => {
    expect(move(at(null), 1).selectedId).toBe("a");
    expect(move(at(null), -1).selectedId).toBe("c");
    expect(move(at("c"), 1).selectedId).toBe("c");
    expect(move(at("a"), -1).selectedId).toBe("a");
    expect(move(at("a"), 1).selectedId).toBe("b");
    expect(move(at(null, [], []), 1).selectedId).toBeNull();
  });

  it("only selects rows that exist", () => {
    expect(select(at(null), "b").selectedId).toBe("b");
    expect(select(at("b"), "zzz").selectedId).toBe("b");
    expect(select(at("b"), null).selectedId).toBeNull();
  });

  it("keeps the selection across a re-render, or moves it to the row that took its place", () => {
    expect(reconcile(at("b"), ["a", "b", "c", "d"]).selectedId).toBe("b");
    expect(reconcile(at("b"), ["a", "c"]).selectedId).toBe("c");
    expect(reconcile(at("c"), ["a", "b"]).selectedId).toBe("b");
    expect(reconcile(at("c"), []).selectedId).toBeNull();
    expect(reconcile(at(null, [], []), ids).selectedId).toBeNull();
  });

  it("moving the selection never disturbs the ticks", () => {
    const s = move(at("a", ["a", "c"]), 1);
    expect(s.selectedId).toBe("b");
    expect(s.checked).toEqual(["a", "c"]);
  });

  it("X ticks and unticks one row, kept in display order; Cmd+A ticks the view; clear empties it", () => {
    let s = toggleCheck(at("b"), "c");
    s = toggleCheck(s, "a");
    expect(s.checked).toEqual(["a", "c"]);
    expect(toggleCheck(s, "c").checked).toEqual(["a"]);
    expect(toggleCheck(s, "zzz")).toBe(s);
    expect(checkAll(s).checked).toEqual(["a", "b", "c"]);
    expect(clearChecks(s).checked).toEqual([]);
    const untouched = at("b");
    expect(clearChecks(untouched)).toBe(untouched);
  });

  it("Shift-click ticks from the keyboard selection to the clicked row and selects it", () => {
    const s = checkRange(at("a"), "c");
    expect(s.checked).toEqual(["a", "b", "c"]);
    expect(s.selectedId).toBe("c");
    // Downwards or upwards, it is the same range; without a selection the last tick anchors it.
    expect(checkRange(at("c"), "a").checked).toEqual(["a", "b", "c"]);
    expect(checkRange(at(null, ["b"]), "c").checked).toEqual(["b", "c"]);
    expect(checkRange(at(null), "b").checked).toEqual(["b"]);
    expect(checkRange(at("a"), "zzz")).toEqual(at("a"));
  });

  it("ticks on rows that left the view are dropped on re-render", () => {
    expect(reconcile(at("a", ["a", "b", "c"]), ["a", "c"]).checked).toEqual(["a", "c"]);
  });
});
