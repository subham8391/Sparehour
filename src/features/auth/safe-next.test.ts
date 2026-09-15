import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a same-origin path and sends everything else to Today", () => {
    expect(safeNext("/inbox")).toBe("/inbox");
    expect(safeNext("/project/abc?x=1")).toBe("/project/abc?x=1");
    expect(safeNext(null)).toBe("/today");
    expect(safeNext("")).toBe("/today");
    expect(safeNext("https://evil.example/")).toBe("/today");
    expect(safeNext("//evil.example/")).toBe("/today");
    expect(safeNext("/\\evil.example")).toBe("/today");
  });
});
