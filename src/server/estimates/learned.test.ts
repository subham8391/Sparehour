// The samples the estimates learn from: the three places a recorded length lives, newest first, capped.
import { describe, expect, it } from "vitest";
import { SAMPLE_LIMIT } from "@/core/estimates";
import { completionRecord, learnedFrom, samplesFrom, spaceParam, tableMissing, type TookRecord } from "./learned";

const record = (over: Partial<TookRecord> = {}): TookRecord => ({ estimate_min: 30, actual_min: 45, project_id: null, completed_at: "2026-11-10T10:00:00+00:00", ...over });

describe("spaceParam", () => {
  it("is null when no space is named, the id when one is, and undefined when it is not an id", () => {
    expect(spaceParam(new URLSearchParams(""))).toBeNull();
    expect(spaceParam(new URLSearchParams("space=FF5E630B-3FE7-4331-BF3F-5262FA898BCE"))).toBe("ff5e630b-3fe7-4331-bf3f-5262fa898bce");
    expect(spaceParam(new URLSearchParams("space=mine"))).toBeUndefined();
  });
});

describe("completionRecord", () => {
  it("takes the estimate and the project from the repeat's task, however the join answers it", () => {
    expect(completionRecord({ actual_min: 70, completed_at: "2026-11-09T07:00:00Z", task: { estimate_min: 60, project_id: "p1" } })).toEqual({ estimate_min: 60, actual_min: 70, project_id: "p1", completed_at: "2026-11-09T07:00:00Z" });
    expect(completionRecord({ actual_min: 70, completed_at: null, task: [{ estimate_min: 60, project_id: null }] }).estimate_min).toBe(60);
    expect(completionRecord({ actual_min: 70, completed_at: null, task: null })).toMatchObject({ estimate_min: null, project_id: null });
  });
});

describe("samplesFrom", () => {
  it("joins the sources newest first and leaves out rows without a length", () => {
    const samples = samplesFrom(
      [record({ actual_min: 10, completed_at: "2026-11-01T00:00:00Z" }), record({ actual_min: null })],
      [record({ actual_min: 20, completed_at: "2026-11-03T00:00:00Z", project_id: "p1" })],
      [record({ actual_min: 30, completed_at: "2026-11-02T00:00:00Z", estimate_min: null }), record({ actual_min: 0 })],
    );
    expect(samples).toEqual([
      { estimateMin: 30, actualMin: 20, projectId: "p1" },
      { estimateMin: null, actualMin: 30, projectId: null },
      { estimateMin: 30, actualMin: 10, projectId: null },
    ]);
  });

  it("keeps only the newest", () => {
    const old = Array.from({ length: SAMPLE_LIMIT }, () => record({ actual_min: 15, completed_at: "2026-01-01T00:00:00Z" }));
    const fresh = Array.from({ length: SAMPLE_LIMIT }, () => record({ actual_min: 60, completed_at: "2026-11-01T00:00:00Z" }));
    const samples = samplesFrom(old, fresh);
    expect(samples).toHaveLength(SAMPLE_LIMIT);
    expect(samples.every((s) => s.actualMin === 60)).toBe(true);
  });
});

describe("learnedFrom", () => {
  it("answers what core/estimates learns from them", () => {
    const rows = Array.from({ length: 6 }, () => record({ estimate_min: 30, actual_min: 60 }));
    expect(learnedFrom(rows, [], [])).toEqual({ estimated: { 30: { n: 6, ratio: 2 } }, unestimated: null, projects: {} });
  });
});

describe("tableMissing", () => {
  it("knows a table that is not there from any other failure", () => {
    expect(tableMissing({ code: "PGRST205" })).toBe(true);
    expect(tableMissing({ code: "42P01" })).toBe(true);
    expect(tableMissing({ code: "42501" })).toBe(false);
    expect(tableMissing(null)).toBe(false);
  });
});
