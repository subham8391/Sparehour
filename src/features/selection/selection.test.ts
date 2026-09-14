import { describe, expect, it } from "vitest";
import { move, reconcile, select } from "./selection";

const ids = ["a", "b", "c"];

describe("selection", () => {
  it("J from nothing selects the first, K the last, and both stop at the ends", () => {
    expect(move({ ids, selectedId: null }, 1).selectedId).toBe("a");
    expect(move({ ids, selectedId: null }, -1).selectedId).toBe("c");
    expect(move({ ids, selectedId: "c" }, 1).selectedId).toBe("c");
    expect(move({ ids, selectedId: "a" }, -1).selectedId).toBe("a");
    expect(move({ ids, selectedId: "a" }, 1).selectedId).toBe("b");
    expect(move({ ids: [], selectedId: null }, 1).selectedId).toBeNull();
  });

  it("only selects rows that exist", () => {
    expect(select({ ids, selectedId: null }, "b").selectedId).toBe("b");
    expect(select({ ids, selectedId: "b" }, "zzz").selectedId).toBe("b");
    expect(select({ ids, selectedId: "b" }, null).selectedId).toBeNull();
  });

  it("keeps the selection across a re-render, or moves it to the row that took its place", () => {
    expect(reconcile({ ids, selectedId: "b" }, ["a", "b", "c", "d"]).selectedId).toBe("b");
    expect(reconcile({ ids, selectedId: "b" }, ["a", "c"]).selectedId).toBe("c");
    expect(reconcile({ ids, selectedId: "c" }, ["a", "b"]).selectedId).toBe("b");
    expect(reconcile({ ids, selectedId: "c" }, []).selectedId).toBeNull();
    expect(reconcile({ ids: [], selectedId: null }, ids).selectedId).toBeNull();
  });
});
