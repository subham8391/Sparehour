// @vitest-environment jsdom
// Today's calendar lines (SCREENS.md §2.7, §21; PRODUCT_SPEC.md §10.3 rules 3 and 5).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarIssue } from "./calendar-state";

const h = vi.hoisted(() => ({
  calendars: [] as { id: string; summary: string; access_role: string | null }[],
  setWriteTarget: vi.fn(() => Promise.resolve()),
  dismissNotices: vi.fn(() => Promise.resolve()),
  calendarSyncNow: vi.fn(() => Promise.resolve({ ok: true, message: "Synced." })),
  issue: null as CalendarIssue | null,
}));
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: h.calendars }), useLocalDatabase: () => ({}) }));
vi.mock("@/data/repositories/calendar-repo", () => ({ CalendarRepo: class { setWriteTarget = h.setWriteTarget; } }));
vi.mock("@/data/repositories/block-repo", () => ({ BlockRepo: class { dismissNotices = h.dismissNotices; } }));
vi.mock("@/features/calendar/sync-now", () => ({ calendarSyncNow: h.calendarSyncNow }));
vi.mock("./calendar-state", async (original) => ({ ...(await original<typeof import("./calendar-state")>()), useCalendarState: () => ({ issue: h.issue, writes: { on: false, off: null } }) }));

const { CalendarBanner, RemovedNote, RECONNECT_HREF } = await import("./calendar-lines");

beforeEach(() => {
  h.calendars = [
    { id: "c-work", summary: "Work", access_role: "owner" },
    { id: "c-team", summary: "Team", access_role: "reader" },
  ];
  h.setWriteTarget.mockClear();
  h.dismissNotices.mockClear();
  h.calendarSyncNow.mockClear();
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

const issue = (over: Partial<CalendarIssue>): CalendarIssue => ({ kind: "error", email: "me@gmail.com", lastSyncedAt: "2026-10-07T09:12:00Z", key: "error:acct:t", blocking: false, ...over });
/** The banner reads the issue itself (useCalendarState); the test hands it one. */
function Banner({ over }: { over: Partial<CalendarIssue> }) {
  h.issue = issue(over);
  return <CalendarBanner />;
}

describe("CalendarBanner", () => {
  it("revoked access: Reconnect goes back through Google's consent to Today, and says blocking is paused", () => {
    render(<Banner over={{ kind: "reauth", blocking: true, key: "reauth:acct" }} />);
    const banner = screen.getByRole("status", { name: "Calendar access" });
    expect(banner).toHaveTextContent("Google Calendar (me@gmail.com) needs reconnecting.");
    expect(banner).toHaveTextContent(/Blocking is paused until you reconnect\. Your blocks stay here, marked not synced\./);
    const reconnect = screen.getByRole("link", { name: "Reconnect" });
    expect(reconnect).toHaveAttribute("href", RECONNECT_HREF);
    expect(reconnect).toHaveClass("w-full", "h-11");
  });

  it("write calendar gone: the picker is inline, picking one sets it, and keeping blocks local puts the banner away", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Banner over={{ kind: "write_gone", blocking: true, key: "gone:acct:t1" }} />);
    expect(screen.getByRole("status", { name: "Where blocks go" })).toHaveTextContent("The calendar your blocks went to is no longer in Google Calendar.");
    const picker = screen.getByRole("radiogroup", { name: "Write calendar" });
    expect(screen.getAllByRole("radio")).toHaveLength(2); // Work (writable) and Keep blocks in Sparehour only; Team is read-only
    await user.click(screen.getByRole("radio", { name: "Work" }));
    expect(h.setWriteTarget).toHaveBeenCalledWith("c-work");
    expect(picker).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Keep blocks in Sparehour only" }));
    expect(screen.queryByRole("status", { name: "Where blocks go" })).toBeNull();
    unmount();
    // The choice holds on this device for this issue.
    render(<Banner over={{ kind: "write_gone", blocking: true, key: "gone:acct:t1" }} />);
    expect(screen.queryByRole("status", { name: "Where blocks go" })).toBeNull();
  });

  it("unreachable: names the last good sync, Retry syncs now, and it can be dismissed for the session", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Banner over={{}} />);
    expect(screen.getByRole("status", { name: "Calendar sync" })).toHaveTextContent(/^Couldn't reach Google Calendar\. Showing your last sync from .+\./);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.calendarSyncNow).toHaveBeenCalled();
    expect(await screen.findByText("Synced.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss for now" }));
    expect(screen.queryByRole("status", { name: "Calendar sync" })).toBeNull();
    unmount();
    render(<Banner over={{}} />);
    expect(screen.queryByRole("status", { name: "Calendar sync" })).toBeNull();
    // A new failure (another last-good time) is a new line.
    render(<Banner over={{ key: "error:acct:t2" }} />);
    expect(screen.getByRole("status", { name: "Calendar sync" })).toBeInTheDocument();
  });
});

describe("RemovedNote (PRODUCT_SPEC.md §10.3 rule 3)", () => {
  it("says it quietly, clears on dismiss, and clears when Today is left so it shows once", async () => {
    const { unmount } = render(<RemovedNote blockIds={["b1", "b2"]} />);
    expect(screen.getByText("Block removed in Google Calendar")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss the note" }));
    expect(h.dismissNotices).toHaveBeenCalledWith(["b1", "b2"]);
    h.dismissNotices.mockClear();
    unmount();
    await vi.waitFor(() => expect(h.dismissNotices).toHaveBeenCalledWith(["b1", "b2"]));
  });
});
