// @vitest-environment jsdom
// The Calendar panel's hook: what it takes from /api/calendar/config. Outlook is offered only when the server says,
// in so many words, that it can connect it; silence, an older answer or a failure all read as no.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [] }), useLocalDatabase: () => ({}) }));

import { useCalendar } from "./use-calendar";

const answer = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));

describe("useCalendar: which calendars the server can connect", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server once, and until it answers Outlook is not offered", async () => {
    answer({ google: true, microsoft: true });
    const { result } = renderHook(() => useCalendar());
    expect([result.current.configured, result.current.outlook]).toEqual([null, false]);
    await waitFor(() => expect(result.current.configured).toBe(true));
    expect(result.current.outlook).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/calendar/config");
  });

  it("a server with Outlook alone offers Outlook and not Google", async () => {
    answer({ google: false, microsoft: true });
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.configured).toBe(false));
    expect(result.current.outlook).toBe(true);
  });

  it("no word of Outlook from the server, a refusal, or no answer at all: Outlook stays absent", async () => {
    answer({ google: true }); // a server from before Outlook
    const older = renderHook(() => useCalendar());
    await waitFor(() => expect(older.result.current.configured).toBe(true));
    expect(older.result.current.outlook).toBe(false);
    older.unmount();

    answer({ error: "unauthenticated" }, 401);
    const refused = renderHook(() => useCalendar());
    await waitFor(() => expect(refused.result.current.configured).toBe(false));
    expect(refused.result.current.outlook).toBe(false);
    refused.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const offline = renderHook(() => useCalendar());
    await waitFor(() => expect(offline.result.current.configured).toBe(false));
    expect(offline.result.current.outlook).toBe(false);
  });
});
