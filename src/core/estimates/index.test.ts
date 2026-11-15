import { describe, expect, it } from "vitest";
import { parse } from "@/core/quickadd";
import { instant, localDate, localTime } from "@/core/time";
import { ENOUGH, SAMPLE_LIMIT, estimateSize, estimateToken, learn, roundLength, suggestDefault, suggestEstimate, tookChoices, type TookSample } from "./index";

const sample = (estimateMin: number | null, actualMin: number, projectId: string | null = null): TookSample => ({ estimateMin, actualMin, projectId });
const many = (n: number, s: TookSample): TookSample[] => Array.from({ length: n }, () => s);

describe("tookChoices", () => {
  it("offers one step under the estimate, the estimate, and two steps over", () => {
    expect(tookChoices(30, 30)).toEqual([15, 30, 45, 60]);
    expect(tookChoices(60, 30)).toEqual([45, 60, 90, 120]);
    expect(tookChoices(120, 30)).toEqual([90, 120, 180, 240]);
  });

  it("counts a task with no estimate as the account's default", () => {
    expect(tookChoices(null, 45)).toEqual([30, 45, 60, 90]);
  });

  it("keeps an estimate that is not on the ladder among the four", () => {
    expect(tookChoices(25, 30)).toEqual([15, 25, 30, 45]);
    expect(tookChoices(600, 30)).toEqual([240, 360, 480, 600]);
  });

  it("still offers four at either end", () => {
    expect(tookChoices(5, 30)).toEqual([5, 10, 15, 30]);
    expect(tookChoices(1, 30)).toEqual([5, 10, 15, 30]);
    expect(tookChoices(480, 30)).toEqual([180, 240, 360, 480]);
  });
});

describe("roundLength", () => {
  it("rounds as people say lengths", () => {
    expect(roundLength(48)).toBe(50);
    expect(roundLength(52)).toBe(50);
    expect(roundLength(100)).toBe(105);
    expect(roundLength(250)).toBe(240);
    expect(roundLength(1)).toBe(5);
  });
});

describe("estimateSize", () => {
  it("is the nearest step of the ladder, by ratio", () => {
    expect(estimateSize(30)).toBe(30);
    expect(estimateSize(25)).toBe(30);
    expect(estimateSize(20)).toBe(15);
    expect(estimateSize(40)).toBe(45);
    expect(estimateSize(50)).toBe(45);
    expect(estimateSize(55)).toBe(60);
    expect(estimateSize(1)).toBe(5);
    expect(estimateSize(1000)).toBe(480);
  });
});

describe("learn", () => {
  it("has nothing to say about nothing", () => {
    expect(learn([])).toEqual({ estimated: {}, unestimated: null, projects: {} });
  });

  it("takes the middle of took ÷ estimated, so one wild task does not move it", () => {
    const learned = learn([sample(30, 45), sample(30, 45), sample(25, 40), sample(30, 600), sample(30, 30)]);
    expect(learned.estimated).toEqual({ 30: { n: 5, ratio: 1.5 } });
  });

  it("keeps each size of estimate apart", () => {
    const learned = learn([...many(3, sample(15, 15)), ...many(4, sample(120, 240))]);
    expect(learned.estimated).toEqual({ 15: { n: 3, ratio: 1 }, 120: { n: 4, ratio: 2 } });
  });

  it("keeps tasks that had no estimate apart: they are what the default stands in for", () => {
    const learned = learn([sample(null, 40), sample(null, 50), sample(null, 45), sample(30, 30)]);
    expect(learned.unestimated).toEqual({ n: 3, minutes: 45 });
    expect(learned.estimated).toEqual({ 30: { n: 1, ratio: 1 } });
  });

  it("learns each project on its own", () => {
    const learned = learn([...many(3, sample(30, 60, "p1")), ...many(2, sample(60, 60, "p2")), sample(null, 20, "p2")]);
    expect(learned.projects.p1).toEqual({ estimated: { 30: { n: 3, ratio: 2 } }, unestimated: null });
    expect(learned.projects.p2).toEqual({ estimated: { 60: { n: 2, ratio: 1 } }, unestimated: { n: 1, minutes: 20 } });
    expect(learned.estimated).toEqual({ 30: { n: 3, ratio: 2 }, 60: { n: 2, ratio: 1 } });
  });

  it("drops lengths that are not lengths, and counts only the newest", () => {
    expect(learn([sample(30, 0), sample(30, Number.NaN)]).estimated).toEqual({});
    const learned = learn([...many(SAMPLE_LIMIT, sample(30, 60)), ...many(50, sample(30, 15))]);
    expect(learned.estimated).toEqual({ 30: { n: SAMPLE_LIMIT, ratio: 2 } });
  });
});

describe("suggestEstimate", () => {
  const runsOver = learn(many(ENOUGH, sample(30, 50)));

  it("says nothing until enough tasks of that size were finished", () => {
    expect(suggestEstimate(learn(many(ENOUGH - 1, sample(30, 60))), { estimateMin: 30, projectId: null }, 30)).toBeNull();
    expect(suggestEstimate(null, { estimateMin: 30, projectId: null }, 30)).toBeNull();
  });

  it("scales the estimate by how estimates of that size run", () => {
    expect(suggestEstimate(runsOver, { estimateMin: 30, projectId: null }, 30)).toEqual({ minutes: 50, n: ENOUGH, from: "all" });
    // 25m counts as the same size, and is scaled from what it is.
    expect(suggestEstimate(runsOver, { estimateMin: 25, projectId: null }, 30)?.minutes).toBe(40);
  });

  it("does not scale a taken suggestion again: another size is another question", () => {
    // Told 50m for a 30m estimate, the person takes it. Nothing is known about tasks estimated at 45m or an hour.
    expect(suggestEstimate(runsOver, { estimateMin: 50, projectId: null }, 30)).toBeNull();
    expect(suggestEstimate(runsOver, { estimateMin: 60, projectId: null }, 30)).toBeNull();
  });

  it("says nothing when the estimate is already about right", () => {
    expect(suggestEstimate(learn(many(ENOUGH, sample(30, 33))), { estimateMin: 30, projectId: null }, 30)).toBeNull();
    // 15m at 1.67× is 25m: ten minutes more, so it is said.
    expect(suggestEstimate(learn(many(ENOUGH, sample(15, 25))), { estimateMin: 15, projectId: null }, 30)?.minutes).toBe(25);
  });

  it("works the other way too, for a person who overestimates", () => {
    expect(suggestEstimate(learn(many(ENOUGH, sample(60, 30))), { estimateMin: 60, projectId: null }, 30)?.minutes).toBe(30);
  });

  it("goes by the task's own project once the project has enough, else by everything", () => {
    const learned = learn([...many(ENOUGH, sample(30, 90, "slow")), ...many(2, sample(30, 30, "new")), ...many(ENOUGH, sample(30, 30))]);
    expect(suggestEstimate(learned, { estimateMin: 30, projectId: "slow" }, 30)).toEqual({ minutes: 90, n: ENOUGH, from: "project" });
    // Overall the middle is 1× (seven on time, five at 3×), so a task elsewhere gets no suggestion.
    expect(suggestEstimate(learned, { estimateMin: 30, projectId: "new" }, 30)).toBeNull();
    expect(suggestEstimate(learned, { estimateMin: 30, projectId: null }, 30)).toBeNull();
  });

  it("for a task with no estimate, says what such tasks took when that is not the default", () => {
    const learned = learn([...many(ENOUGH, sample(null, 50)), ...many(ENOUGH, sample(null, 90, "p")), ...many(ENOUGH, sample(45, 45, "q"))]);
    // Ten unestimated tasks in all: five at 50m and the project's five at 90m. The middle is 70m, said to the quarter hour.
    expect(suggestEstimate(learned, { estimateMin: null, projectId: null }, 30)).toEqual({ minutes: 75, n: 2 * ENOUGH, from: "all" });
    expect(suggestEstimate(learned, { estimateMin: null, projectId: "p" }, 30)).toEqual({ minutes: 90, n: ENOUGH, from: "project" });
    // A project whose finished tasks all had estimates says nothing of its own about one without.
    expect(suggestEstimate(learned, { estimateMin: null, projectId: "q" }, 30)?.from).toBe("all");
    expect(suggestEstimate(learned, { estimateMin: null, projectId: null }, 75)).toBeNull();
  });
});

describe("suggestDefault", () => {
  it("offers what unestimated tasks have been taking, when it is not the default", () => {
    const learned = learn(many(ENOUGH, sample(null, 45)));
    expect(suggestDefault(learned, 30)).toEqual({ n: ENOUGH, minutes: 45 });
    expect(suggestDefault(learned, 45)).toBeNull();
    expect(suggestDefault(learn(many(ENOUGH - 1, sample(null, 45))), 30)).toBeNull();
    expect(suggestDefault(null, 30)).toBeNull();
  });
});

describe("estimateToken", () => {
  const ctx = { now: instant("2026-11-16T09:00:00Z"), zone: "UTC", today: localDate("2026-11-16"), eveningStartsAt: localTime("18:00") };

  it("writes a length the way quick add reads one", () => {
    expect(estimateToken(45)).toBe("~45m");
    expect(estimateToken(120)).toBe("~2h");
    expect(estimateToken(105)).toBe("~1h45m");
    for (const minutes of [5, 45, 60, 105, 120, 270]) {
      const result = parse(`Write it up ${estimateToken(minutes)}`, ctx);
      expect(result.ok && result.draft.estimateMin).toBe(minutes);
    }
  });
});
