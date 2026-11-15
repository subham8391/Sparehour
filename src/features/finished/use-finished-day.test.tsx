// @vitest-environment jsdom
// One day's finished tasks from the server: asked for as the day is shown, fetched whole however many pages it
// takes, started again for another day, and ended in words every time — offline, no table yet, an error, or a
// request that never answers.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedPage, FinishedQuery, FinishedRow } from "./finished";

const fetchFinished = vi.fn<(q: FinishedQuery, signal?: AbortSignal) => Promise<FinishedPage>>();
vi.mock("./finished", () => ({ fetchFinished: (q: FinishedQuery, signal?: AbortSignal) => fetchFinished(q, signal) }));

const { useFinishedDay } = await import("./use-finished-day");

const FROM = "2026-10-20T00:00:00Z";
const TO = "2026-10-21T00:00:00Z";
const row = (id: string, at = "2026-10-20T09:00:00+00:00") => ({ id, completed_at: at, title: id }) as FinishedRow;
const page = (rows: FinishedRow[], more = false): FinishedPage => ({ available: true, rows, more });

beforeEach(() => fetchFinished.mockReset());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useFinishedDay", () => {
  it("asks for the day between its two instants as soon as it is shown, and says loading until it is in", async () => {
    fetchFinished.mockResolvedValueOnce(page([row("a"), row("b")]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    expect(result.current).toMatchObject({ status: "loading", rows: [] });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(fetchFinished).toHaveBeenCalledTimes(1);
    expect(fetchFinished.mock.calls[0][0]).toEqual({ from: FROM, to: TO, limit: 100, after: null });
  });

  it("a day with nothing finished is ready and empty", async () => {
    fetchFinished.mockResolvedValueOnce(page([]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current).toMatchObject({ status: "ready", rows: [] }));
  });

  it("fetches a long day whole: every page from the last row of the one before, never cut", async () => {
    fetchFinished
      .mockResolvedValueOnce(page([row("a", "2026-10-20T18:00:00.123456+00:00"), row("b", "2026-10-20T12:00:00.654321+00:00")], true))
      .mockResolvedValueOnce(page([row("c", "2026-10-20T08:00:00+00:00")], true))
      .mockResolvedValueOnce(page([row("d", "2026-10-20T07:00:00+00:00")]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    // The cursor goes back as it came, to the microsecond.
    expect(fetchFinished.mock.calls[1][0]).toMatchObject({ from: FROM, to: TO, after: { id: "b", completed_at: "2026-10-20T12:00:00.654321+00:00" } });
    expect(fetchFinished.mock.calls[2][0]).toMatchObject({ after: { id: "c", completed_at: "2026-10-20T08:00:00+00:00" } });
  });

  it("a server that keeps answering the same page with more to come does not go round for ever", async () => {
    fetchFinished.mockResolvedValue(page([row("a"), row("b")], true));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(fetchFinished).toHaveBeenCalledTimes(2);
  });

  it("says unavailable where the server keeps no older tasks yet", async () => {
    fetchFinished.mockResolvedValueOnce({ available: false, rows: [], more: false });
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current).toMatchObject({ status: "unavailable", rows: [] }));
  });

  it("an error is an error; Try again asks afresh and can succeed", async () => {
    fetchFinished.mockRejectedValueOnce(new Error("older finished tasks: 500")).mockResolvedValueOnce(page([row("a")]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.rows).toEqual([]);
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a"]);
    expect(fetchFinished.mock.calls[1][0]).toMatchObject({ after: null });
  });

  it("with no connection it says offline, and asks again by itself when the connection is back", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fetchFinished.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(page([row("a")]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current.status).toBe("offline"));
    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchFinished).toHaveBeenCalledTimes(2);
    // Once it is in, a later "online" asks for nothing more.
    act(() => void window.dispatchEvent(new Event("online")));
    expect(fetchFinished).toHaveBeenCalledTimes(2);
  });

  it("a request that never answers is given up on: an error with a way on, not a wait without end", async () => {
    vi.useFakeTimers();
    fetchFinished.mockImplementationOnce((_q, signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    expect(result.current.status).toBe("loading");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.status).toBe("error");
  });

  it("another day starts again from loading, and an answer for the day before is dropped", async () => {
    let answerOld: (p: FinishedPage) => void = () => {};
    fetchFinished.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve))).mockResolvedValueOnce(page([row("new")]));
    const { result, rerender } = renderHook(({ from, to }) => useFinishedDay(from, to), { initialProps: { from: FROM, to: TO } });
    rerender({ from: "2026-10-19T00:00:00Z", to: FROM });
    expect(result.current).toMatchObject({ status: "loading", rows: [] });
    await act(async () => answerOld(page([row("old")])));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["new"]);
    expect(fetchFinished.mock.calls[0][1]?.aborted).toBe(true);
    expect(fetchFinished.mock.calls[1][0]).toMatchObject({ from: "2026-10-19T00:00:00Z", to: FROM });
  });

  it("takes a row out when it was reopened or deleted", async () => {
    fetchFinished.mockResolvedValueOnce(page([row("a"), row("b")]));
    const { result } = renderHook(() => useFinishedDay(FROM, TO));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.remove("a"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["b"]);
  });
});
