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
  onSyncNow: vi.fn(),
  onDisconnect: vi.fn(),
  onRead: vi.fn(),
  onPrivate: vi.fn(),
  onWriteTarget: vi.fn(),
  ...over,
});

const account = { id: "a1", email: "sam@gmail.com", status: "ok" as const, lastSyncedAt: new Date(Date.now() - 12_000).toISOString(), lastError: null, canWrite: false };
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

  it("each calendar has busy and hide-titles switches, and the write picker lists only writable ones", async () => {
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
    expect(radios.map((r) => r.parentElement?.textContent?.trim())).toEqual(["Personal", "Keep blocks in Sparehour only"]);
    expect(radios[0]).toBeChecked();
    await user.click(radios[1]);
    expect(p.onWriteTarget).toHaveBeenCalledWith(null);
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/needs one more permission/)).toBeInTheDocument();
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
    expect(consentOutcome("?x=1")).toBeNull();
  });

  it("row mappers read the 0/1 columns and unknown statuses as ok", () => {
    expect(toAccountView({ id: "a", provider: "google", email: "e", status: "weird", can_write: 1, last_synced_at: null, last_error: null })).toMatchObject({ status: "ok", canWrite: true });
    expect(toCalendarView({ id: "c", calendar_account_id: "a", external_id: "x", summary: null, color: null, access_role: "owner", read: null, private: 1, write_target: 0, last_synced_at: null })).toMatchObject({ summary: "Untitled calendar", read: true, private: true, writeTarget: false });
  });
});
