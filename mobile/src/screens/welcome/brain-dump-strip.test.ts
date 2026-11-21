// The brain dump's strip: a line with no day of its own is restated as today's, a line with its own day is left as
// the composer read it, and after the twentieth the default stops.
import type { TaskDraft } from "@/core/quickadd";
import { localDate } from "@/core/time";
import { BRAIN_DUMP_TODAY_LIMIT } from "@/features/welcome/welcome-rules";
import type { StripChip } from "~/screens/quick-add/use-composer";
import { brainDumpStrip } from "./brain-dump-strip";

const TODAY = localDate("2026-11-21");
const draft = (over: Partial<TaskDraft> = {}) => ({ title: "Call the plumber", doDate: null, doTime: null, evening: false, estimateMin: null, deadline: null, startDate: null, recurrenceRule: null, projectName: null, tagNames: [], priority: 0, notes: null, ...over }) as unknown as TaskDraft;
const chip = (kind: StripChip["kind"], text: string, onRemove?: () => void): StripChip => ({ kind, text, tentative: false, here: false, onRemove });

describe("brainDumpStrip", () => {
  it("leaves an empty box as it is", () => {
    expect(brainDumpStrip([], null, null, TODAY, 0)).toEqual({ chips: [], destination: null, saved: null });
  });

  it("puts a line with no day on today: the day leads the chips, with no way to take it off, and the arrow says Today", () => {
    const estimate = chip("estimate", "45m", jest.fn());
    const strip = brainDumpStrip([estimate], "Inbox", draft({ estimateMin: 45 }), TODAY, 0);
    expect(strip.chips.map((c) => c.text)).toEqual(["Today", "45m"]);
    expect(strip.chips[0]).toMatchObject({ kind: "day", here: false });
    expect(strip.chips[0].onRemove).toBeUndefined();
    expect(strip.chips[1]).toBe(estimate);
    expect(strip.destination).toBe("Today");
    expect(strip.saved?.doDate?.toString()).toBe("2026-11-21");
  });

  it("rewords an evening typed with no day, and keeps its way back to words", () => {
    const back = jest.fn();
    const strip = brainDumpStrip([chip("evening", "This evening", back)], "Inbox", draft({ evening: true }), TODAY, 3);
    expect(strip.chips).toHaveLength(1);
    expect(strip.chips[0]).toMatchObject({ kind: "evening", text: "Today, evening" });
    expect(strip.chips[0].onRemove).toBe(back);
    expect(strip.destination).toBe("Today");
  });

  it("leaves a line that names its own day, or a start date, as the composer read it", () => {
    const friday = [chip("day", "Fri 27 Nov", jest.fn())];
    const dated = draft({ doDate: localDate("2026-11-27") });
    expect(brainDumpStrip(friday, "Upcoming", dated, TODAY, 0)).toEqual({ chips: friday, destination: "Upcoming", saved: dated });
    const later = draft({ startDate: localDate("2026-12-01") });
    expect(brainDumpStrip([chip("start", "from Tue 1 Dec")], "Upcoming", later, TODAY, 0).destination).toBe("Upcoming");
  });

  it("stops giving today after the twentieth: the rest go where a quick-add goes", () => {
    const line = draft();
    expect(brainDumpStrip([], "Inbox", line, TODAY, BRAIN_DUMP_TODAY_LIMIT - 1).destination).toBe("Today");
    expect(brainDumpStrip([], "Inbox", line, TODAY, BRAIN_DUMP_TODAY_LIMIT)).toEqual({ chips: [], destination: "Inbox", saved: line });
  });
});
