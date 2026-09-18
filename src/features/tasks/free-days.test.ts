import { describe, expect, it } from "vitest";
import { foldFreeDays } from "./free-days";

const free = (n: number) => n === 0;

describe("foldFreeDays", () => {
  it("keeps a lone free day as its own day", () => {
    expect(foldFreeDays([2, 0, 3], free)).toEqual([
      { kind: "day", day: 2 },
      { kind: "day", day: 0 },
      { kind: "day", day: 3 },
    ]);
  });

  it("folds two or more free days in a row into one run", () => {
    expect(foldFreeDays([1, 0, 0, 0, 2, 0, 0], free)).toEqual([
      { kind: "day", day: 1 },
      { kind: "run", days: [0, 0, 0] },
      { kind: "day", day: 2 },
      { kind: "run", days: [0, 0] },
    ]);
  });

  it("an empty week is one run; a full week is untouched", () => {
    expect(foldFreeDays([0, 0, 0], free)).toEqual([{ kind: "run", days: [0, 0, 0] }]);
    expect(foldFreeDays([1, 2], free)).toEqual([
      { kind: "day", day: 1 },
      { kind: "day", day: 2 },
    ]);
    expect(foldFreeDays([], free)).toEqual([]);
  });
});
