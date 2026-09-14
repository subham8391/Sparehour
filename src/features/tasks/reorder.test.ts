import { describe, expect, it } from "vitest";
import { evenKeys } from "@/core/ordering";
import { edgeFor, planDrop } from "./reorder";

const keys = evenKeys(4);
const list = ["a", "b", "c", "d"].map((id, i) => ({ id, key: keys[i] }));

describe("edgeFor", () => {
  it("splits the row at its midline", () => {
    expect(edgeFor(104, { top: 100, height: 44 })).toBe("top");
    expect(edgeFor(130, { top: 100, height: 44 })).toBe("bottom");
  });
});

describe("planDrop", () => {
  it("lands above or below the target and returns a key that sorts there", () => {
    const down = planDrop(list, "a", "c", "bottom")!;
    expect(down.index).toBe(2);
    expect(down.key > keys[2] && down.key < keys[3]).toBe(true);
    const up = planDrop(list, "d", "b", "top")!;
    expect(up.index).toBe(1);
    expect(up.key > keys[0] && up.key < keys[1]).toBe(true);
    const first = planDrop(list, "c", "a", "top")!;
    expect(first.index).toBe(0);
    expect(first.key < keys[0]).toBe(true);
    const last = planDrop(list, "a", "d", "bottom")!;
    expect(last.index).toBe(3);
    expect(last.key > keys[3]).toBe(true);
  });

  it("is a no-op when the drop would leave the row where it is", () => {
    expect(planDrop(list, "b", "a", "bottom")).toBeNull();
    expect(planDrop(list, "b", "c", "top")).toBeNull();
    expect(planDrop(list, "b", "zzz", "top")).toBeNull();
  });

  it("a row from another list is inserted, and empty keys are tolerated", () => {
    const into = planDrop(list, "x", "b", "top")!;
    expect(into.index).toBe(1);
    expect(into.key > keys[0] && into.key < keys[1]).toBe(true);
    const bare = planDrop([{ id: "a", key: null }, { id: "b", key: null }], "b", "a", "top")!;
    expect(bare.index).toBe(0);
    expect(typeof bare.key).toBe("string");
  });
});
