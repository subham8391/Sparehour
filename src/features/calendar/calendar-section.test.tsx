// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { takesBlocks } from "./blocks-go";
import { CalendarSettings, relativeTime, withConsent, type CalendarPanel } from "./calendar-section";
import { connectHref, providerOf } from "./providers";
import { consentOutcome, toAccountView, toCalendarView } from "./use-calendar";

const panel = (over: Partial<CalendarPanel> = {}): CalendarPanel => ({
  configured: true,
  // Outlook is there only once the server has said it can connect it.
  outlook: false,
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
const account = { id: "a1", provider: "google" as const, email: "sam@gmail.com", status: "ok" as const, lastSyncedAt: new Date(Date.now() - 12_000).toISOString(), lastError: null, canWrite: true, titles: true, writesOwn: true };
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
    expect(toAccountView({ id: "a", provider: "google", email: "e", status: "weird", can_write: 1, last_synced_at: null, last_error: null })).toMatchObject({ provider: "google", status: "ok", canWrite: true, titles: false, writesOwn: false });
    // An Outlook account as the server mirrors it: no write flags, no titles.
    expect(toAccountView({ id: "m", provider: "microsoft", email: "e", status: "ok", can_write: 0, can_read_titles: 0, can_write_own: 0, last_synced_at: null, last_error: null })).toMatchObject({ provider: "microsoft", canWrite: false, titles: false, writesOwn: false });
    expect(toAccountView({ id: "a", provider: "google", email: "e", status: "ok", can_write: 1, can_read_titles: 1, can_write_own: 1, last_synced_at: null, last_error: null })).toMatchObject({ titles: true, writesOwn: true });
    expect(toCalendarView({ id: "c", calendar_account_id: "a", external_id: "x", summary: null, color: null, access_role: "owner", read: null, private: 1, write_target: 0, last_synced_at: null })).toMatchObject({ summary: "Untitled calendar", read: true, private: true, writeTarget: false });
  });
});

describe("<CalendarSettings> with Outlook (DECISIONS.md, amendment 2026-11-15)", () => {
  // As the server mirrors an Outlook account: busy times only, and nothing it can write.
  const outlook = { id: "m1", provider: "microsoft" as const, email: "sam@contoso.com", status: "ok" as const, lastSyncedAt: new Date(Date.now() - 12_000).toISOString(), lastError: null, canWrite: false, titles: false, writesOwn: false };
  const outlookCalendars = [
    { id: "o1", accountId: "m1", summary: "Calendar", color: null, accessRole: "owner", read: true, private: false, writeTarget: false },
    { id: "o2", accountId: "m1", summary: "Birthdays", color: null, accessRole: "reader", read: false, private: false, writeTarget: false },
  ];

  it("is not there at all unless the server says it can connect Outlook: no button, no word of it, connected or not", () => {
    for (const configured of [true, false, null]) {
      const empty = render(<CalendarSettings panel={panel({ configured })} />);
      expect(screen.queryByRole("button", { name: /Outlook/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Outlook/)).not.toBeInTheDocument();
      empty.unmount();
    }
    render(<CalendarSettings panel={panel({ accounts: [account], calendars })} />);
    expect(screen.queryByRole("button", { name: /Outlook/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Outlook/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another Google account" })).toBeEnabled();
  });

  it("with nothing connected, offers Outlook beside Google, each leaving for its own consent, and says what is kept of Outlook", async () => {
    const user = userEvent.setup();
    const p = panel({ outlook: true });
    render(<CalendarSettings panel={p} />);
    expect(screen.getByText("From Outlook we keep only the times you're busy. Sparehour can't put blocks in Outlook yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect Outlook" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("microsoft");
    await user.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("google");
    expect(p.onConnect).toHaveBeenCalledTimes(2);
  });

  it("where only Outlook can be connected, Google's button and its 'not set up' line are left out", () => {
    render(<CalendarSettings panel={panel({ configured: false, outlook: true })} />);
    expect(screen.getByRole("button", { name: "Connect Outlook" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Connect Google Calendar" })).not.toBeInTheDocument();
    expect(screen.queryByText(/isn.t set up on this server yet/)).not.toBeInTheDocument();
  });

  it("a connected Outlook account shows like a Google one: its name, status, Sync now, and its calendars with 'counts as busy'", async () => {
    const user = userEvent.setup();
    const p = panel({ outlook: true, accounts: [outlook], calendars: outlookCalendars });
    render(<CalendarSettings panel={p} />);
    expect(screen.getByText("Outlook")).toBeInTheDocument();
    expect(screen.queryByText("Google Calendar")).not.toBeInTheDocument();
    expect(screen.getByText("sam@contoso.com")).toBeInTheDocument();
    expect(screen.getByText(/Connected · busy times only · synced 1\ds ago/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(p.onSyncNow).toHaveBeenCalledTimes(1);
    const busy = screen.getAllByRole("switch", { name: "Counts as busy" });
    expect(busy.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false"]); // Calendar counts; Birthdays, read-only, does not
    await user.click(busy[1]);
    expect(p.onRead).toHaveBeenCalledWith("o2", true);
    // No titles are kept, so there are none to hide.
    expect(screen.queryByRole("switch", { name: "Hide titles" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect…" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(p.onDisconnect).toHaveBeenCalledWith("m1");
  });

  it("read only: no Outlook calendar can take blocks, nothing of Google's is offered to it, and the line says why", () => {
    render(<CalendarSettings panel={panel({ outlook: true, accounts: [outlook], calendars: outlookCalendars })} />);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim())).toEqual(["Keep blocks in Sparehour only"]);
    expect(screen.getByRole("radio")).toBeChecked();
    expect(screen.getByText("Sparehour can't put blocks in Outlook yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show blocks in Google Calendar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on full access" })).not.toBeInTheDocument();
    // Another of the same, or Google beside it.
    expect(screen.getByRole("button", { name: "Add another Outlook account" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeEnabled();
  });

  it("beside a Google account that writes anywhere, the picker still lists Google's calendars only, and each calendar says whose it is", () => {
    // "Calendar" is the person's own in Outlook (owner), and still not offered: nothing is written there.
    render(<CalendarSettings panel={panel({ outlook: true, accounts: [account, outlook], calendars: [...calendars, ...outlookCalendars] })} />);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim())).toEqual(["Personal", "Keep blocks in Sparehour only"]);
    expect(screen.getByText("Sparehour can't put blocks in Outlook yet.")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(rows.find((t) => t.startsWith("Calendar"))).toMatch(/^CalendarOutlook/);
    expect(rows.find((t) => t.startsWith("Personal"))).toMatch(/^PersonalGoogle/);
    // Hide titles belongs to the Google account that reads them, not to Outlook's calendars.
    expect(screen.getAllByRole("switch", { name: "Hide titles" })).toHaveLength(2);
    expect(screen.getAllByRole("switch", { name: "Counts as busy" })).toHaveLength(4);
    expect(takesBlocks({ accountId: "m1", summary: "Calendar", accessRole: "owner" }, [account, outlook])).toBe(false);
    expect(takesBlocks({ accountId: "m1", summary: "Sparehour", accessRole: "owner" }, [account, outlook])).toBe(false);
    // Whatever an Outlook account's row were to claim, none of its calendars takes blocks; a Google one with the same flags does.
    const claims = { id: "m1", canWrite: true, writesOwn: true };
    expect(takesBlocks({ accountId: "m1", summary: "Calendar", accessRole: "owner" }, [{ ...claims, provider: "microsoft" }])).toBe(false);
    expect(takesBlocks({ accountId: "m1", summary: "Calendar", accessRole: "owner" }, [{ ...claims, provider: "google" }])).toBe(true);
    expect(takesBlocks({ accountId: "m1", summary: "Calendar", accessRole: "owner" }, [claims])).toBe(true);
  });

  it("an Outlook account that needs reconnecting goes back to Microsoft's consent, not Google's; and waits where the server no longer can", async () => {
    const user = userEvent.setup();
    const p = panel({ outlook: true, accounts: [{ ...outlook, status: "needs_reauth" }] });
    const view = render(<CalendarSettings panel={p} />);
    expect(screen.getByText(/Needs reconnecting/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(p.onConnect).toHaveBeenCalledWith("microsoft");
    view.unmount();
    render(<CalendarSettings panel={panel({ outlook: false, accounts: [{ ...outlook, status: "needs_reauth" }] })} />);
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeDisabled();
  });
});

describe("withConsent: the section's ways out to a consent screen", () => {
  it("connects Google or Outlook from their own start routes, and Google's two later grants from Google's, each coming back to Settings", () => {
    const leave = vi.fn();
    const { onConnect, onAllowWrite, onFullAccess, ...state } = panel({ outlook: true });
    const whole = withConsent(state, leave);
    whole.onConnect();
    whole.onConnect("google");
    whole.onConnect("microsoft");
    whole.onAllowWrite();
    whole.onFullAccess();
    expect(leave.mock.calls.map((c) => c[0])).toEqual([
      "/api/calendar/google/start?next=%2Fsettings",
      "/api/calendar/google/start?next=%2Fsettings",
      "/api/calendar/microsoft/start?next=%2Fsettings",
      "/api/calendar/google/start?purpose=write&next=%2Fsettings",
      "/api/calendar/google/start?purpose=full&next=%2Fsettings",
    ]);
    // The rest of the panel is passed through as it came.
    expect(whole).toMatchObject({ outlook: true, configured: true, onSyncNow: state.onSyncNow });
    expect([onConnect, onAllowWrite, onFullAccess].every((f) => vi.mocked(f).mock.calls.length === 0)).toBe(true);
  });
});

describe("providers", () => {
  it("each provider's consent starts at its own route and comes back to where it was asked from", () => {
    expect(connectHref("google", "/settings")).toBe("/api/calendar/google/start?next=%2Fsettings");
    expect(connectHref("google", "/settings", "write")).toBe("/api/calendar/google/start?purpose=write&next=%2Fsettings");
    expect(connectHref("google", "/today", "full")).toBe("/api/calendar/google/start?purpose=full&next=%2Ftoday");
    expect(connectHref("microsoft", "/settings")).toBe("/api/calendar/microsoft/start?next=%2Fsettings");
    // Outlook has one consent: a purpose is Google's and is not passed on.
    expect(connectHref("microsoft", "/welcome", "full")).toBe("/api/calendar/microsoft/start?next=%2Fwelcome");
  });

  it("reads the connection's provider, taking anything unknown for Google, which came first", () => {
    expect([providerOf("microsoft"), providerOf("google"), providerOf(null), providerOf("caldav")]).toEqual(["microsoft", "google", "google", "google"]);
  });
});
