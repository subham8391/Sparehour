// @vitest-environment jsdom
// The device's copy of what the estimates learned: kept across reloads, asked for again when old or when a new
// length was recorded, and left alone when the server cannot be reached.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Learned } from "@/core/estimates";
import { FRESH_MS, learnedFor, learnedIsOld, refreshLearned, resetLearned, subscribeLearned } from "./learned-store";

const SPACE = "ff5e630b-3fe7-4331-bf3f-5262fa898bce";
const LEARNED: Learned = { estimated: { 30: { n: 6, ratio: 1.5 } }, unestimated: null, projects: {} };
const answer = (learned: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => ({ learned }) }) as Response);

beforeEach(() => {
  window.localStorage.clear();
  resetLearned();
});

describe("the learned store", () => {
  it("knows nothing until the server has answered", () => {
    expect(learnedFor(SPACE)).toBeNull();
    expect(learnedFor(null)).toBeNull();
  });

  it("asks once, keeps the answer, and tells whoever is listening", async () => {
    const ask = answer(LEARNED);
    const heard = vi.fn();
    const stop = subscribeLearned(heard);
    await refreshLearned(SPACE, 1_000, ask);
    expect(ask).toHaveBeenCalledWith(`/api/estimates/learned?space=${SPACE}`, expect.objectContaining({ credentials: "same-origin" }));
    expect(learnedFor(SPACE)).toEqual(LEARNED);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    // Another space's answer is not this one's.
    expect(learnedFor("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("does not ask again while the answer is fresh, and does once it is old", async () => {
    const ask = answer(LEARNED);
    await refreshLearned(SPACE, 1_000, ask);
    await refreshLearned(SPACE, 1_000 + FRESH_MS - 1, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    await refreshLearned(SPACE, 1_000 + FRESH_MS, ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("survives a reload", async () => {
    await refreshLearned(SPACE, 1_000, answer(LEARNED));
    resetLearned();
    expect(learnedFor(SPACE)).toEqual(LEARNED);
  });

  it("asks again after a new length is recorded, still answering from what it has meanwhile", async () => {
    const ask = answer(LEARNED);
    await refreshLearned(SPACE, 1_000, ask);
    learnedIsOld();
    expect(learnedFor(SPACE)).toEqual(LEARNED);
    await refreshLearned(SPACE, 2_000, ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("keeps what it has when the server fails, answers nonsense or cannot be reached", async () => {
    await refreshLearned(SPACE, 1_000, answer(LEARNED));
    const later = 1_000 + FRESH_MS;
    await refreshLearned(SPACE, later, answer(LEARNED, false));
    await refreshLearned(SPACE, later, answer("nope"));
    await refreshLearned(SPACE, later, vi.fn(async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch);
    expect(learnedFor(SPACE)).toEqual(LEARNED);
  });

  it("does not ask while the device is offline", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const ask = answer(LEARNED);
    await refreshLearned(SPACE, 1_000, ask);
    expect(ask).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it("ignores a kept value it cannot read", () => {
    window.localStorage.setItem("sparehour.learned", "{not json");
    expect(learnedFor(SPACE)).toBeNull();
  });
});
