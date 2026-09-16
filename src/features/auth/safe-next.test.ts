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
    // The URL parser strips tabs and newlines, so these would resolve to another origin.
    expect(safeNext("/\t/evil.example")).toBe("/today");
    expect(safeNext("/\n/evil.example")).toBe("/today");
    expect(safeNext("/\r\n//evil.example")).toBe("/today");
    // Percent-encoded control characters stay a literal path on this origin.
    expect(safeNext("/%09/evil.example")).toBe("/%09/evil.example");
    expect(safeNext("/today#calendar")).toBe("/today#calendar");
  });
});
