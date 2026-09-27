import { describe, expect, it, vi } from "vitest";
import { Temporal, localDate } from "@/core/time";
import { TODAY, taskFixture } from "@/test/fixtures";
import { DEFAULT_CHOICE, allFromYesterday, applyChoices, reviewLine, shouldReview, type Choice, type ChoiceRepo, type ReviewInput } from "./carry-review";

const base: ReviewInput = { enabled: true, carried: 3, syncState: "synced", pathname: "/today", today: null, yesterday: null };

describe("shouldReview", () => {
  it("asks on the first open of a day with carried tasks, once the sync has settled", () => {
    expect(shouldReview(base)).toBe(true);
    expect(shouldReview({ ...base, syncState: "unprotected" })).toBe(true);
    expect(shouldReview({ ...base, syncState: "offline" })).toBe(true);
    expect(shouldReview({ ...base, pathname: "/inbox" })).toBe(true);
    expect(shouldReview({ ...base, today: { carryReviewedAt: null, plannedAt: null }, yesterday: { shutdownAt: null } })).toBe(true);
  });

  it("never asks when the switch is off, nothing carried, or the sync is still settling", () => {
    expect(shouldReview({ ...base, enabled: false })).toBe(false);
    expect(shouldReview({ ...base, carried: 0 })).toBe(false);
    expect(shouldReview({ ...base, syncState: "connecting" })).toBe(false);
    expect(shouldReview({ ...base, syncState: "syncing" })).toBe(false);
  });

  it("stays out of the rituals, and never asks twice: reviewed, planned this morning, or closed last night", () => {
    expect(shouldReview({ ...base, pathname: "/plan" })).toBe(false);
    expect(shouldReview({ ...base, pathname: "/shutdown" })).toBe(false);
    expect(shouldReview({ ...base, pathname: "/planner" })).toBe(true);
    expect(shouldReview({ ...base, today: { carryReviewedAt: "2026-09-14T08:00:00Z", plannedAt: null } })).toBe(false);
    expect(shouldReview({ ...base, today: { carryReviewedAt: null, plannedAt: "2026-09-14T08:00:00Z" } })).toBe(false);
    expect(shouldReview({ ...base, yesterday: { shutdownAt: "2026-09-13T17:40:00Z" } })).toBe(false);
  });
});

describe("reviewLine", () => {
  it("says what happened, in the product's voice, singular and plural", () => {
    expect(reviewLine(3, true)).toBe("3 things didn’t happen yesterday.");
    expect(reviewLine(1, true)).toBe("1 thing didn’t happen yesterday.");
    expect(reviewLine(3, false)).toBe("3 things are still waiting.");
    expect(reviewLine(1, false)).toBe("1 thing is still waiting.");
  });

  it("knows when every carried task was due yesterday", () => {
    const yesterday = TODAY.subtract({ days: 1 });
    expect(allFromYesterday([taskFixture("a", "A", { doDate: yesterday }), taskFixture("b", "B", { doDate: yesterday })], TODAY)).toBe(true);
    expect(allFromYesterday([taskFixture("a", "A", { doDate: yesterday }), taskFixture("b", "B", { doDate: localDate("2026-09-10") })], TODAY)).toBe(false);
    expect(allFromYesterday([], TODAY)).toBe(false);
  });
});

function fakeRepo(): ChoiceRepo & { calls: string[] } {
  const calls: string[] = [];
  const show = (a: unknown): string => (Array.isArray(a) ? a.join("+") : a instanceof Temporal.PlainDate ? a.toString() : typeof a === "object" && a !== null ? JSON.stringify(a) : String(a));
  const log = (name: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push(`${name}(${args.map(show).join(", ")})`);
    });
  return { calls, reschedule: log("reschedule"), updateMany: log("updateMany"), setState: log("setState"), setStateMany: log("setStateMany") };
}

describe("applyChoices", () => {
  it("defaults to keep, which is the carried row's Keep today", async () => {
    expect(DEFAULT_CHOICE).toBe("keep");
    const repo = fakeRepo();
    await applyChoices(repo, new Map<string, Choice>([["a", "keep"]]), TODAY);
    expect(repo.reschedule).toHaveBeenCalledWith("a", TODAY);
    expect(repo.calls).toEqual(["reschedule(a, 2026-09-14)"]);
  });

  it("writes each answer through the repository, batching tasks that share one so one Done is one undo per answer", async () => {
    const repo = fakeRepo();
    const choices = new Map<string, Choice>([
      ["a", "keep"],
      ["b", "keep"],
      ["c", "tomorrow"],
      ["d", "someday"],
      ["e", "someday"],
      ["f", "drop"],
      ["g", { day: localDate("2026-09-18") }],
    ]);
    await applyChoices(repo, choices, TODAY);
    expect(repo.updateMany).toHaveBeenCalledWith(["a", "b"], { doDate: TODAY }, "Moved {title} to today");
    expect(repo.reschedule).toHaveBeenCalledWith("c", localDate("2026-09-15"));
    expect(repo.reschedule).toHaveBeenCalledWith("g", localDate("2026-09-18"));
    expect(repo.setStateMany).toHaveBeenCalledWith(["d", "e"], "someday");
    expect(repo.setState).toHaveBeenCalledWith("f", "dropped");
    expect(repo.calls).toEqual([
      'updateMany(a+b, {"doDate":"2026-09-14"}, Moved {title} to today)',
      "reschedule(c, 2026-09-15)",
      "reschedule(g, 2026-09-18)",
      "setStateMany(d+e, someday)",
      "setState(f, dropped)",
    ]);
  });

  it("writes nothing for an empty review", async () => {
    const repo = fakeRepo();
    await applyChoices(repo, new Map(), TODAY);
    expect(repo.calls).toEqual([]);
  });
});
