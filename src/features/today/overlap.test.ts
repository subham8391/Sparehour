import { describe, expect, it } from "vitest";
import { layoutLanes } from "./overlap";

const lane = (m: Map<string, { column: number; columns: number }>, id: string) => `${m.get(id)?.column}/${m.get(id)?.columns}`;

describe("layoutLanes", () => {
  it("blocks that do not overlap each take the full width", () => {
    const m = layoutLanes([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 600, end: 660 },
      { id: "c", start: 700, end: 730 },
    ]);
    expect([lane(m, "a"), lane(m, "b"), lane(m, "c")]).toEqual(["0/1", "0/1", "0/1"]);
  });

  it("two overlapping blocks sit side by side; a chain shares the cluster's width and reuses a freed column", () => {
    const m = layoutLanes([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 570, end: 630 },
      { id: "c", start: 600, end: 660 }, // a has ended: column 0 is free again
      { id: "d", start: 800, end: 830 }, // a separate cluster
    ]);
    expect([lane(m, "a"), lane(m, "b"), lane(m, "c"), lane(m, "d")]).toEqual(["0/2", "1/2", "0/2", "0/1"]);
  });

  it("three at once means three columns; order of input does not matter", () => {
    const blocks = [
      { id: "c", start: 550, end: 560 },
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 540, end: 570 },
    ];
    const m = layoutLanes(blocks);
    expect(new Set([m.get("a")?.column, m.get("b")?.column, m.get("c")?.column]).size).toBe(3);
    expect([m.get("a")?.columns, m.get("b")?.columns, m.get("c")?.columns]).toEqual([3, 3, 3]);
    expect(layoutLanes([])).toEqual(new Map());
  });
});
