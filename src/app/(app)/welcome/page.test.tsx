// @vitest-environment jsdom
// The first run's route over an in-memory database: it waits for the account, confirms the hours and the zone in
// one tap, offers the calendar where the server can connect one (Google, Outlook or both; once, with the consent's
// answer said when it was no), comes back to where it was after a reload, and ends on Today with the account stamped.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { localSqlite } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/test/local-sqlite").localSqlite>,
  users: [{ id: "u1", personal_space_id: "s1" }] as { id: string; personal_space_id: string | null }[],
  replace: vi.fn(),
  undo: [] as { label: string; undo: () => Promise<void> }[],
  /** What /api/calendar/config answers: whether this server can connect Google, or a failure. */
  google: false as boolean | "down",
  /** Whether it says it can connect Outlook; "unsaid" is a server that does not mention it at all. */
  microsoft: "unsaid" as boolean | "unsaid",
}));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("from users")) return { data: h.users, isLoading: false };
    return { data: h.db.rows(sql), isLoading: false };
  },
  useLocalDatabase: () => h.db.db,
}));
vi.mock("@/features/shell/use-local-day", () => ({
  useNow: () => instant("2026-10-07T08:00:00Z"),
  useLocalDay: () => ({ today: localDate("2026-10-07"), zone: "Europe/London", settings: null }),
}));
vi.mock("@/features/undo/undo-provider", () => ({ useUndoSink: () => ({ record: (e: { label: string; undo: () => Promise<void> }) => void h.undo.push(e) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock("@/features/welcome/welcome-rules", async (actual) => ({ ...(await actual<typeof import("@/features/welcome/welcome-rules")>()), detectedZone: () => "Europe/London" }));
// The brain dump is its own island with its own tests; here it only has to be the step on screen.
vi.mock("@/features/welcome/brain-dump", () => ({
  BrainDump: function BrainDumpStub({ onFinish }: { onFinish: () => void }) {
    return (
      <button type="button" onClick={onFinish}>
        Brain dump
      </button>
    );
  },
}));
// The page's islands (the brain dump, the calendar step) arrive a moment after they are asked for, as they do in the
// browser: each is whatever its loader resolves to, and nothing is on screen until it has.
vi.mock("next/dynamic", async () => {
  const { createElement, useEffect, useState } = await import("react");
  type Island = (props: Record<string, unknown>) => ReturnType<typeof createElement> | null;
  return {
    default: (load: () => Promise<Island>) =>
      function Dynamic(props: Record<string, unknown>) {
        const [loaded, setLoaded] = useState<{ island: Island } | null>(null);
        useEffect(() => {
          let live = true;
          void load().then((island) => live && setLoaded({ island }));
          return () => {
            live = false;
          };
        }, []);
        return loaded ? createElement(loaded.island, props) : null;
      },
  };
});

import WelcomePage from "./page";

const settingsRow = () => h.db.rows("select timezone, onboarded_at from user_settings where id = 'row1'")[0];
const hours = (weekday: number) => h.db.rows("select start_time, end_time from work_hours where deleted_at is null and weekday = ? order by start_time", [weekday]);

beforeEach(() => {
  h.db = localSqlite();
  h.db.insert("user_settings", { id: "row1", user_id: "u1", space_id: "s1", timezone: "UTC", onboarded_at: null, created_at: "2026-10-07T08:00:00Z" });
  for (const weekday of [0, 1, 2, 3, 4]) h.db.insert("work_hours", { id: `w${weekday}`, space_id: "s1", user_id: "u1", weekday, start_time: "09:00:00", end_time: "18:00:00" });
  h.users = [{ id: "u1", personal_space_id: "s1" }];
  h.replace.mockClear();
  h.undo = [];
  h.google = false;
  h.microsoft = "unsaid";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/welcome");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url !== "/api/calendar/config" || h.google === "down") throw new Error("offline");
      return new Response(JSON.stringify({ google: h.google, ...(h.microsoft === "unsaid" ? {} : { microsoft: h.microsoft }) }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("/welcome", () => {
  it("waits for the account before asking anything", () => {
    h.users = [];
    render(<WelcomePage />);
    expect(screen.getByText("Opening…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "When do you work?" })).not.toBeInTheDocument();
  });

  it("That's right takes the device's zone (a Google sign-up starts on UTC), keeps the hours, and moves on to the brain dump", async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);
    expect(screen.getByText(/Times are in/)).toHaveTextContent("Times are in Europe/London.");
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(settingsRow().timezone).toBe("Europe/London");
    expect(hours(0)).toEqual([{ start_time: "09:00:00", end_time: "18:00:00" }]);
    expect(settingsRow().onboarded_at).toBeNull();
    // One ⌘Z puts the zone back.
    expect(h.undo.map((u) => u.label)).toEqual(["Set your working hours"]);
    await act(() => h.undo[0].undo());
    expect(settingsRow().timezone).toBe("UTC");
  });

  it("an edited week is written day by day", async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);
    await user.click(screen.getByRole("button", { name: "Friday" }));
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    await screen.findByRole("button", { name: "Brain dump" });
    expect(hours(4)).toEqual([]);
    expect(hours(3)).toHaveLength(1);
  });

  it("a reload after the hours comes back to the brain dump", async () => {
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
  });

  it("another account on the device starts at the hours", () => {
    window.localStorage.setItem("sparehour.first-run.hours", "someone-else");
    render(<WelcomePage />);
    expect(screen.getByRole("heading", { name: "When do you work?" })).toBeInTheDocument();
  });

  it("finishing stamps the account and opens Today", async () => {
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    window.localStorage.setItem("sparehour.first-run.calendar", "u1");
    const user = userEvent.setup();
    render(<WelcomePage />);
    await user.click(await screen.findByRole("button", { name: "Brain dump" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/today"));
    expect(settingsRow().onboarded_at).toMatch(/^2\d{3}-/);
    expect(window.localStorage.getItem("sparehour.first-run.hours")).toBeNull();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBeNull();
  });

  it("an account that is already set up goes to Today", () => {
    h.db.rows("update user_settings set onboarded_at = '2026-10-01T00:00:00Z' where id = 'row1'");
    render(<WelcomePage />);
    expect(h.replace).toHaveBeenCalledWith("/today");
    expect(screen.queryByRole("heading", { name: "When do you work?" })).not.toBeInTheDocument();
  });
});

describe("/welcome, the calendar step (ONBOARDING.md step 2; DECISIONS.md, amendment 2026-11-14)", () => {
  const atCalendar = () => screen.findByRole("heading", { name: "Connect your calendar." });

  it("comes after the hours where the server can connect Google: it says what is read, connects by leaving for Google, and Skip moves on", async () => {
    h.google = true;
    const user = userEvent.setup();
    render(<WelcomePage />);
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(await atCalendar()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Brain dump" })).not.toBeInTheDocument();
    expect(screen.getByText("We read when you're busy.")).toBeInTheDocument();
    expect(screen.getByText("We don't see what your meetings are.")).toBeInTheDocument();
    expect(screen.getByText("We don't change anything.")).toBeInTheDocument();
    // Busy times only, and back to this page: no purpose asked for, so Google shows no warning screen.
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute("href", "/api/calendar/google/start?next=%2Fwelcome");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBe("u1");
    expect(settingsRow().onboarded_at).toBeNull();
  });

  it("is asked once: a reload after Skip comes back to the brain dump", async () => {
    h.google = true;
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    window.localStorage.setItem("sparehour.first-run.calendar", "u1");
    render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect your calendar." })).not.toBeInTheDocument();
  });

  it("back from Google connected: on to the brain dump, remembered, and the address is plain again", async () => {
    h.google = true;
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    window.history.replaceState(null, "", "/welcome?calendar=connected");
    render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBe("u1");
    expect(window.location.search).toBe("");
  });

  it("back from Google with a no: the step stays with one calm line and both ways on", async () => {
    h.google = true;
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    window.history.replaceState(null, "", "/welcome?calendar=denied&reason=access_denied");
    render(<WelcomePage />);
    await atCalendar();
    expect(screen.getByRole("status")).toHaveTextContent("No problem. You can connect later from Settings.");
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBeNull();
  });

  it("a failure says Google's reason, or that it did not answer", async () => {
    h.google = true;
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    window.history.replaceState(null, "", `/welcome?calendar=error&reason=${encodeURIComponent("That connection attempt has expired. Try again.")}`);
    render(<WelcomePage />);
    await atCalendar();
    expect(screen.getByRole("status")).toHaveTextContent("That connection attempt has expired. Try again.");
  });

  it("is not offered where a calendar is already connected, where the server cannot connect one, or when it does not answer", async () => {
    h.google = true;
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    h.db.insert("calendar_connections", { id: "k1", provider: "google", email: "me@example.com", status: "ok" });
    const first = render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    first.unmount();

    h.db.rows("delete from calendar_connections");
    for (const answer of [false, "down"] as const) {
      h.google = answer;
      const view = render(<WelcomePage />);
      expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Connect your calendar." })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("/welcome, the calendar step with Outlook (DECISIONS.md, amendment 2026-11-15)", () => {
  const atCalendar = () => screen.findByRole("heading", { name: "Connect your calendar." });
  const pastTheHours = () => window.localStorage.setItem("sparehour.first-run.hours", "u1");

  it("where the server can connect both, both are offered, each leaving for its own consent and back to this page", async () => {
    h.google = true;
    h.microsoft = true;
    pastTheHours();
    render(<WelcomePage />);
    await atCalendar();
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute("href", "/api/calendar/google/start?next=%2Fwelcome");
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toHaveAttribute("href", "/api/calendar/microsoft/start?next=%2Fwelcome");
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    // Skip first, the ways to connect after it, where the thumb is on a phone.
    expect([...document.querySelectorAll("footer a, footer button")].map((el) => el.textContent?.trim())).toEqual(["Skip for now", "Connect Outlook", "Connect Google Calendar"]);
    // What is true of both: what is kept. Microsoft's permission covers a meeting's name, so "we don't see" is not said.
    expect(screen.getByText("We read when you're busy.")).toBeInTheDocument();
    expect(screen.getByText("We keep only the times.")).toBeInTheDocument();
    expect(screen.queryByText("We don't see what your meetings are.")).not.toBeInTheDocument();
    expect(screen.getByText("We don't change anything.")).toBeInTheDocument();
    expect(screen.getByText(/With Outlook, Microsoft.s screen asks to let Sparehour read your calendars\. It has no narrower permission to ask for; the times are all we keep\./)).toBeInTheDocument();
    // The later choices in Settings are Google's, and are said as Google's.
    expect(screen.getByText(/With Google Calendar, meeting names and time blocks on your calendar are yours to add later in Settings\./)).toBeInTheDocument();
  });

  it("where the server can connect Outlook alone, the step is still offered, with Outlook only and no promise of later choices", async () => {
    h.google = false;
    h.microsoft = true;
    const user = userEvent.setup();
    render(<WelcomePage />);
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    await atCalendar();
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toHaveAttribute("href", "/api/calendar/microsoft/start?next=%2Fwelcome");
    expect(screen.queryByRole("link", { name: "Connect Google Calendar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Without it, the number uses your working hours alone\./)).toBeInTheDocument();
    expect(screen.queryByText(/yours to add later in Settings/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBe("u1");
  });

  it("Outlook is absent unless the server says it can connect it: not said, or said no, the step is Google's as it was", async () => {
    for (const answer of ["unsaid", false] as const) {
      h.google = true;
      h.microsoft = answer;
      pastTheHours();
      const view = render(<WelcomePage />);
      await atCalendar();
      expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Outlook/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Outlook|Microsoft/)).not.toBeInTheDocument();
      expect(screen.getByText("We don't see what your meetings are.")).toBeInTheDocument();
      expect(screen.getByText(/Meeting names, and time blocks on your calendar, are yours to add later in Settings\./)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("back from Microsoft: connected goes on; a no stays with one calm line and every way on; a failure says the reason", async () => {
    h.google = true;
    h.microsoft = true;
    pastTheHours();
    window.history.replaceState(null, "", "/welcome?calendar=connected");
    const connected = render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(window.localStorage.getItem("sparehour.first-run.calendar")).toBe("u1");
    connected.unmount();

    window.localStorage.removeItem("sparehour.first-run.calendar");
    window.history.replaceState(null, "", "/welcome?calendar=denied&reason=access_denied");
    const refused = render(<WelcomePage />);
    await atCalendar();
    expect(screen.getByRole("status")).toHaveTextContent("No problem. You can connect later from Settings.");
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
    refused.unmount();

    window.history.replaceState(null, "", `/welcome?calendar=error&reason=${encodeURIComponent("Outlook didn't answer. Try again.")}`);
    render(<WelcomePage />);
    await atCalendar();
    expect(screen.getByRole("status")).toHaveTextContent("Outlook didn't answer. Try again.");
  });

  it("is not offered once an Outlook calendar is connected", async () => {
    h.google = true;
    h.microsoft = true;
    pastTheHours();
    h.db.insert("calendar_connections", { id: "k1", provider: "microsoft", email: "sam@contoso.com", status: "ok" });
    render(<WelcomePage />);
    expect(await screen.findByRole("button", { name: "Brain dump" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect your calendar." })).not.toBeInTheDocument();
  });
});
