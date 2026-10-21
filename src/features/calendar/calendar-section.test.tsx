// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarSettings, relativeTime, type CalendarPanel } from "./calendar-section";
import { consentOutcome, toAccountView, toCalendarView } from "./use-calendar";

const panel = (over: Partial<CalendarPanel> = {}): CalendarPanel => ({
  configured: true,
  accounts: [],
  calendars: [],
  notice: null,
  busy: false,
  onConnect: vi.fn(),
  onAllowWrite: vi.fn(),
  onFullAccess: vi.fn(),
  onSyncNow: vi.fn(),
  onDisconnect: vi.fn(),
  onRead: vi.fn(),
  onPrivate: vi.fn(),
  onWriteTarget: vi.fn(),
  ...over,
});

// An account with full access (titles, and blocks on any calendar the person owns).
const account = { id: "a1", email: "sam@gmail.com", status: "ok" as const, lastSyncedAt: new Date(Date.now() - 12_000).toISOString(), lastError: null, canWrite: true, titles: true, writesOwn: true };
// The default since 2026-10-21: busy times only, and no writing yet.
const busyAccount = { ...account, canWrite: false, titles: false, writesOwn: false };
const calendars = [
  { id: "c1", accountId: "a1", summary: "Personal", color: "#9fe1e7", accessRole: "owner", read: true, private: false, writeTarget: true },
  { id: "c2", accountId: "a1", summary: "Holidays", color: null, accessRole: "reader", read: false, private: false, writeTarget: false },
];

describe("<CalendarSettings>", () => {
  it("with nothing connected, states the promise and offers Google — unless the server cannot", async () => {
    const user = userEvent.setup();
    const p = panel();
    const { unmount } = render(<CalendarSettings panel={p} />);
    expect(screen.getByText(/We read all your calendars/)).toBeInTheDocument();
    expect(screen.getByText(/We write to one calendar only/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(p.onConnect).toHaveBeenCalledTimes(1);
    unmount();
    render(<CalendarSettings panel={panel({ configured: false })} />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeDisabled();
    expect(screen.getByText(/isn.t set up on this server yet/)).toBeInTheDocument();
  });

  it("shows each account with its sync status, syncs now, and disconnects only after a second press", async () => {
    const user = userEvent.setup();
    const p = panel({ accounts: [account], calendars });
    render(<CalendarSettings panel={p} />);
    expect(screen.getByText("sam@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/Connected · synced 1\ds ago/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(p.onSyncNow).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Disconnect…" }));
    expect(p.onDisconnect).not.toHaveBeenCalled();
    expect(screen.getByText("Your blocks stay, unsynced.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(p.onDisconnect).toHaveBeenCalledWith("a1");
  });

  it("an account that needs reconnecting says so and offers Reconnect", () => {
    render(<CalendarSettings panel={panel({ accounts: [{ ...account, status: "needs_reauth" }] })} />);
    expect(screen.getByText(/Needs reconnecting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("with full access, each calendar has busy and hide-titles switches, and the write picker lists only writable ones", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const p = panel({ accounts: [account], calendars });
    render(<CalendarSettings panel={p} onChanged={onChanged} />);
    expect(screen.getByText("read-only")).toBeInTheDocument();
    const busy = screen.getAllByRole("switch", { name: "Counts as busy" });
    expect(busy[0]).toHaveAttribute("aria-checked", "true");
    expect(busy[1]).toHaveAttribute("aria-checked", "false");
    await user.click(busy[1]);
    expect(p.onRead).toHaveBeenCalledWith("c2", true);
    await user.click(screen.getAllByRole("switch", { name: "Hide titles" })[0]);
    expect(p.onPrivate).toHaveBeenCalledWith("c1", true);
    const radios = screen.getAllByRole("radio");
    // The Radio primitive wraps the native input in its own 44 px box, so the row's words live on the label.
    expect(radios.map((r) => r.closest("label")?.textContent?.trim())).toEqual(["Personal", "Keep blocks in Sparehour only"]);
    expect(radios[0]).toBeChecked();
    await user.click(radios[1]);
    expect(p.onWriteTarget).toHaveBeenCalledWith(null);
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("busy times only: no titles to hide, blocks stay here until the Sparehour calendar is allowed, and full access is offered with Google's warning named", async () => {
    const user = userEvent.setup();
    const p = panel({ accounts: [busyAccount], calendars });
    render(<CalendarSettings panel={p} />);
    expect(screen.getByText(/Connected · busy times only · synced 1\ds ago/)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Hide titles" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("switch", { name: "Counts as busy" })).toHaveLength(2);
    // Nothing can take blocks yet: only "keep them here" is on offer, with the one step that adds the Sparehour calendar.
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim())).toEqual(["Keep blocks in Sparehour only"]);
    await user.click(screen.getByRole("button", { name: "Show blocks in Google Calendar" }));
    expect(p.onAllowWrite).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Choose Advanced, then Go to Sparehour/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn on full access" }));
    expect(p.onFullAccess).toHaveBeenCalledTimes(1);
  });

  it("writing through the Sparehour calendar: it is the one place blocks can go; the person's own calendars are not offered", () => {
    const own = { id: "c3", accountId: "a1", summary: "Sparehour", color: null, accessRole: "owner", read: true, private: false, writeTarget: true };
    render(<CalendarSettings panel={panel({ accounts: [{ ...busyAccount, canWrite: true }], calendars: [{ ...calendars[0], writeTarget: false }, calendars[1], own] })} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")?.textContent?.trim())).toEqual(["The Sparehour calendar in your Google Calendar", "Keep blocks in Sparehour only"]);
    expect(radios[0]).toBeChecked();
    expect(screen.queryByRole("button", { name: "Show blocks in Google Calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on full access" })).toBeInTheDocument();
  });

  it("with full access on, the upgrade is not offered", () => {
    render(<CalendarSettings panel={panel({ accounts: [account], calendars })} />);
    expect(screen.queryByRole("button", { name: "Turn on full access" })).not.toBeInTheDocument();
    expect(screen.queryByText(/busy times only/)).not.toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("relativeTime reads naturally", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    expect(relativeTime(null)).toBe("not yet");
    expect(relativeTime("2026-09-15T11:59:58Z", now)).toBe("just now");
    expect(relativeTime("2026-09-15T11:59:30Z", now)).toBe("30s ago");
    expect(relativeTime("2026-09-15T11:45:00Z", now)).toBe("15m ago");
    expect(relativeTime("2026-09-15T09:00:00Z", now)).toBe("3h ago");
  });

  it("consentOutcome turns the callback's query into one line, with the server's reason when it gave one", () => {
    expect(consentOutcome("?calendar=connected")).toMatch(/Connected/);
    expect(consentOutcome("?calendar=denied")).toMatch(/No problem/);
    expect(consentOutcome("?calendar=error&reason=Google+did+not+send+a+code+back.")).toBe("Google did not send a code back.");
    expect(consentOutcome("?calendar=read_only")).toMatch(/one more permission/);
    expect(consentOutcome("?calendar=write_denied&reason=access_denied")).toMatch(/show them in Google Calendar later/);
    expect(consentOutcome("?calendar=full")).toMatch(/meeting titles/);
    expect(consentOutcome("?calendar=full_denied")).toMatch(/keeps reading your busy times/);
    expect(consentOutcome("?calendar=no_read")).toMatch(/leave that box ticked/);
    expect(consentOutcome("?x=1")).toBeNull();
  });

  it("row mappers read the 0/1 columns and unknown statuses as ok", () => {
    expect(toAccountView({ id: "a", provider: "google", email: "e", status: "weird", can_write: 1, last_synced_at: null, last_error: null })).toMatchObject({ status: "ok", canWrite: true, titles: false, writesOwn: false });
    expect(toAccountView({ id: "a", provider: "google", email: "e", status: "ok", can_write: 1, can_read_titles: 1, can_write_own: 1, last_synced_at: null, last_error: null })).toMatchObject({ titles: true, writesOwn: true });
    expect(toCalendarView({ id: "c", calendar_account_id: "a", external_id: "x", summary: null, color: null, access_role: "owner", read: null, private: 1, write_target: 0, last_synced_at: null })).toMatchObject({ summary: "Untitled calendar", read: true, private: true, writeTarget: false });
  });
});
