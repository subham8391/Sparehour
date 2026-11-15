// Older finished tasks as the app reads them: a server row becomes a device task row, a repeat's occurrence becomes
// a completion of its task, the request carries the filters and the cursor unrounded, and the export walks every page.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllFinished, fetchFinished, finishedUrl, splitFinished, toTaskRow, type FinishedRow } from "./finished";

const row = (over: Partial<FinishedRow> = {}): FinishedRow =>
  ({
    id: "t1",
    space_id: "s1",
    title: "Send the invoice",
    state: "done",
    evening: false,
    estimate_min: 45,
    completed_at: "2026-10-01T09:30:00.123456+00:00",
    checklist: [{ title: "Attach the PDF", done: true }],
    tag_ids: ["g1"],
    blocks: null,
    occurrence_of: null,
    occurrence_date: null,
    ...over,
  }) as FinishedRow;

afterEach(() => vi.unstubAllGlobals());

describe("toTaskRow and splitFinished", () => {
  it("reads as a device task row: the task's columns only, 1/0 for true/false", () => {
    const t = toTaskRow(row({ evening: true }));
    expect(t).toMatchObject({ id: "t1", title: "Send the invoice", evening: 1, estimate_min: 45 });
    expect(Object.keys(t)).not.toEqual(expect.arrayContaining(["checklist", "tag_ids", "blocks", "occurrence_of", "occurrence_date"]));
    expect(toTaskRow(row()).evening).toBe(0);
  });

  it("a repeat's occurrence is a completion of its task; everything else is a finished task", () => {
    const { done, completions } = splitFinished([row(), row({ id: "c9", title: "Gym", occurrence_of: "t-gym", occurrence_date: "2026-09-28", completed_at: "2026-09-28T07:00:00+00:00" })]);
    expect(done.map((d) => d.id)).toEqual(["t1"]);
    expect(completions).toEqual([expect.objectContaining({ id: "t-gym", completion_id: "c9", occurrence_completed_at: "2026-09-28T07:00:00+00:00", title: "Gym" })]);
  });

  it("keeps how long each took: a task's on the task, an occurrence's as the occurrence's", () => {
    const { done, completions } = splitFinished([row({ actual_min: 70 }), row({ id: "c9", occurrence_of: "t-gym", actual_min: 55, completed_at: "2026-09-28T07:00:00+00:00" }), row({ id: "c8", occurrence_of: "t-gym", completed_at: "2026-09-21T07:00:00+00:00" })]);
    expect(done[0].actual_min).toBe(70);
    expect(completions.map((c) => c.occurrence_actual_min)).toEqual([55, null]);
  });
});

describe("finishedUrl", () => {
  it("is the bare route with nothing asked, and carries the filters and the cursor as they are", () => {
    expect(finishedUrl({})).toBe("/api/logbook/older");
    const url = new URL(finishedUrl({ words: " pay rent ", project: "p1", tag: "client", from: "2026-10-01T00:00:00Z", limit: 20, after: { id: "t1", completed_at: "2026-10-01T09:30:00.123456+00:00" } }), "https://x.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "pay rent", project: "p1", tag: "client", from: "2026-10-01T00:00:00Z", limit: "20", before: "2026-10-01T09:30:00.123456+00:00", after: "t1" });
  });
});

describe("fetchFinished and fetchAllFinished", () => {
  const answer = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

  it("answers the page, treats a server without the table as nothing older, and throws on an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer({ available: true, rows: [row()], more: true })).mockResolvedValueOnce(answer({ available: false, rows: [], more: false })).mockResolvedValueOnce(answer({ error: "server" }, false)));
    expect(await fetchFinished({})).toMatchObject({ available: true, more: true, rows: [{ id: "t1" }] });
    expect(await fetchFinished({})).toEqual({ available: false, rows: [], more: false });
    await expect(fetchFinished({})).rejects.toThrow(/500/);
  });

  it("walks every page for the export, each from the last row of the one before", async () => {
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(answer({ available: true, rows: [row({ id: "a" }), row({ id: "b", completed_at: "2026-09-30T08:00:00+00:00" })], more: true }))
      .mockResolvedValueOnce(answer({ available: true, rows: [row({ id: "c" })], more: false }));
    vi.stubGlobal("fetch", fetched);
    expect((await fetchAllFinished()).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(fetched.mock.calls[0][0]).toBe("/api/logbook/older?limit=100");
    expect(new URL(fetched.mock.calls[1][0], "https://x.test").searchParams.get("after")).toBe("b");
    expect(new URL(fetched.mock.calls[1][0], "https://x.test").searchParams.get("before")).toBe("2026-09-30T08:00:00+00:00");
  });
});
