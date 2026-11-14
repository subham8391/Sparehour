// @vitest-environment jsdom
// Pages of older finished tasks: asked for only on load, added a page at a time from the last row shown, started
// again when the question changes, and honest about an error or a server that keeps none.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedPage, FinishedQuery, FinishedRow } from "./finished";

const fetchFinished = vi.fn<(q: FinishedQuery, signal?: AbortSignal) => Promise<FinishedPage>>();
vi.mock("./finished", () => ({ fetchFinished: (q: FinishedQuery, signal?: AbortSignal) => fetchFinished(q, signal) }));

const { useFinished } = await import("./use-finished");

const row = (id: string, at = "2026-10-01T09:00:00+00:00") => ({ id, completed_at: at, title: id }) as FinishedRow;

beforeEach(() => fetchFinished.mockReset());
afterEach(() => vi.clearAllMocks());

describe("useFinished", () => {
  it("asks for nothing until load, then adds each page from the last row shown", async () => {
    fetchFinished.mockResolvedValueOnce({ available: true, rows: [row("a"), row("b", "2026-09-30T09:00:00+00:00")], more: true }).mockResolvedValueOnce({ available: true, rows: [row("c")], more: false });
    const { result } = renderHook(() => useFinished({ project: "p1" }));
    expect(result.current).toMatchObject({ rows: [], status: "idle", more: null, available: true });
    expect(fetchFinished).not.toHaveBeenCalled();

    act(() => result.current.load());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b"]));
    expect(result.current).toMatchObject({ status: "idle", more: true });
    expect(fetchFinished.mock.calls[0][0]).toEqual({ project: "p1", after: null });

    act(() => result.current.load());
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b", "c"]));
    expect(fetchFinished.mock.calls[1][0]).toEqual({ project: "p1", after: { id: "b", completed_at: "2026-09-30T09:00:00+00:00" } });
    expect(result.current.more).toBe(false);
    // Nothing more to ask for.
    act(() => result.current.load());
    expect(fetchFinished).toHaveBeenCalledTimes(2);
  });

  it("starts again when the question changes, and drops a page that answers the old one", async () => {
    let answerOld: (p: FinishedPage) => void = () => {};
    fetchFinished.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve))).mockResolvedValueOnce({ available: true, rows: [row("new")], more: false });
    const { result, rerender } = renderHook(({ words }) => useFinished({ words }), { initialProps: { words: "rent" } });
    act(() => result.current.load());
    rerender({ words: "invoice" });
    expect(result.current).toMatchObject({ rows: [], status: "idle", more: null });
    await act(async () => answerOld({ available: true, rows: [row("old")], more: true }));
    expect(result.current.rows).toEqual([]);
    act(() => result.current.load());
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["new"]));
  });

  it("says when a page could not be fetched and lets it be asked for again; a row reopened is taken out", async () => {
    fetchFinished.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ available: true, rows: [row("a"), row("b")], more: false });
    const { result } = renderHook(() => useFinished({}));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    act(() => result.current.remove("a"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("where the server keeps no older tasks, says so and asks no more", async () => {
    fetchFinished.mockResolvedValueOnce({ available: false, rows: [], more: false });
    const { result } = renderHook(() => useFinished({}));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.available).toBe(false));
    act(() => result.current.load());
    expect(fetchFinished).toHaveBeenCalledTimes(1);
  });
});
