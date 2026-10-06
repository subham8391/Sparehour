import { describe, expect, it } from "vitest";
import { repeatPolicy } from "./repeat-policy";

describe("repeatPolicy (A6, DECISIONS.md 2026-10-06)", () => {
  it("a first repeat turns the one-off default carry into skip", () => {
    expect(repeatPolicy({ recurrenceRule: null, missPolicy: "carry" }, "FREQ=DAILY")).toEqual({ missPolicy: "skip" });
  });

  it("Stop repeating turns skip back into carry", () => {
    expect(repeatPolicy({ recurrenceRule: "FREQ=WEEKLY", missPolicy: "skip" }, null)).toEqual({ missPolicy: "carry" });
  });

  it("a policy the person chose is left alone, and changing a rule keeps whatever the repeat had", () => {
    expect(repeatPolicy({ recurrenceRule: null, missPolicy: "expire" }, "FREQ=DAILY")).toEqual({});
    expect(repeatPolicy({ recurrenceRule: "FREQ=MONTHLY", missPolicy: "carry" }, "FREQ=WEEKLY")).toEqual({});
    expect(repeatPolicy({ recurrenceRule: "FREQ=MONTHLY", missPolicy: "skip" }, "FREQ=WEEKLY")).toEqual({});
    expect(repeatPolicy({ recurrenceRule: "FREQ=MONTHLY", missPolicy: "expire" }, null)).toEqual({});
    expect(repeatPolicy({ recurrenceRule: null, missPolicy: "carry" }, null)).toEqual({});
  });
});
