import { describe, expect, it } from "vitest";
import { instant } from "../time";
import { readTypedDate } from "./read-date";
import type { ParseContext } from "./types";

// Friday 2026-09-11 09:00 Europe/London.
const ctx: ParseContext = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London" };
const read = (s: string) => {
  const r = readTypedDate(s, ctx);
  return r && { date: r.date.toString(), time: r.time?.toString({ smallestUnit: "minute" }) ?? null, evening: r.evening };
};

describe("readTypedDate", () => {
  it("reads relative and absolute dates", () => {
    expect(read("next tue")?.date).toBe("2026-09-15");
    expect(read("21 oct")?.date).toBe("2026-10-21");
    expect(read("in 3 days")?.date).toBe("2026-09-14");
    expect(read("tomorrow")?.date).toBe("2026-09-12");
    expect(read("  Today ")?.date).toBe("2026-09-11");
    expect(read("2026-12-01")?.date).toBe("2026-12-01");
  });

  it("reads a time with the date, and a bare time as today or tomorrow", () => {
    expect(read("fri 3pm")).toEqual({ date: "2026-09-18", time: "15:00", evening: false });
    expect(read("3pm")).toEqual({ date: "2026-09-11", time: "15:00", evening: false });
    expect(read("7am")).toEqual({ date: "2026-09-12", time: "07:00", evening: false });
    expect(read("tonight")).toEqual({ date: "2026-09-11", time: null, evening: true });
    expect(read("tue evening")).toEqual({ date: "2026-09-15", time: null, evening: true });
  });

  it("is not a date unless every word is date or time", () => {
    for (const s of ["", "   ", "soon", "next", "fri and sat", "#acme fri", "{fri}", "after mon", "every mon", "~45m", "fri ~45m"]) expect(read(s), s).toBeNull();
  });
});
