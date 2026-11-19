import { describe, expect, it } from "vitest";
import { MAX_LENGTH_MIN, parseLength } from "./parse-length";

describe("parseLength", () => {
  it("reads a bare number as minutes", () => {
    expect(parseLength("150")).toBe(150);
    expect(parseLength(" 5 ")).toBe(5);
  });

  it("reads minutes with their unit", () => {
    expect(parseLength("90m")).toBe(90);
    expect(parseLength("45 min")).toBe(45);
    expect(parseLength("20 minutes")).toBe(20);
  });

  it("reads hours, with or without minutes after them", () => {
    expect(parseLength("2h")).toBe(120);
    expect(parseLength("2h 30m")).toBe(150);
    expect(parseLength("2h30")).toBe(150);
    expect(parseLength("2 H 30 Min")).toBe(150);
    expect(parseLength("1 hour 5 minutes")).toBe(65);
    expect(parseLength("3hrs")).toBe(180);
  });

  it("reads part hours and a clock-like h:mm", () => {
    expect(parseLength("1.5h")).toBe(90);
    expect(parseLength("1,5h")).toBe(90);
    expect(parseLength("0.25h")).toBe(15);
    expect(parseLength("2:30")).toBe(150);
    expect(parseLength("0:45")).toBe(45);
  });

  it("is null for nothing, for words it does not know and for a part number without a unit", () => {
    expect(parseLength("")).toBeNull();
    expect(parseLength("   ")).toBeNull();
    expect(parseLength("soon")).toBeNull();
    expect(parseLength("1.5")).toBeNull();
    expect(parseLength("2h 30m 10")).toBeNull();
    expect(parseLength("30m 2h")).toBeNull();
    expect(parseLength("2:75")).toBeNull();
    expect(parseLength("-30")).toBeNull();
  });

  it("is null for no time at all and for more than a day", () => {
    expect(parseLength("0")).toBeNull();
    expect(parseLength("0h")).toBeNull();
    expect(parseLength("24h")).toBe(MAX_LENGTH_MIN);
    expect(parseLength("1440")).toBe(1440);
    expect(parseLength("1441")).toBeNull();
    expect(parseLength("24h 1m")).toBeNull();
    expect(parseLength("25:00")).toBeNull();
  });
});
