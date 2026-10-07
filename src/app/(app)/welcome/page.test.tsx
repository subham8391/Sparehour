// @vitest-environment jsdom
// The first run's route over an in-memory database: it waits for the account, confirms the hours and the zone in
// one tap, comes back to the brain dump after a reload, and ends on Today with the account stamped.
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
vi.mock("next/dynamic", () => ({
  default: () =>
    function BrainDumpStub({ onFinish }: { onFinish: () => void }) {
      return (
        <button type="button" onClick={onFinish}>
          Brain dump
        </button>
      );
    },
}));

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
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

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

  it("a reload after the hours comes back to the brain dump", () => {
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    render(<WelcomePage />);
    expect(screen.getByRole("button", { name: "Brain dump" })).toBeInTheDocument();
  });

  it("another account on the device starts at the hours", () => {
    window.localStorage.setItem("sparehour.first-run.hours", "someone-else");
    render(<WelcomePage />);
    expect(screen.getByRole("heading", { name: "When do you work?" })).toBeInTheDocument();
  });

  it("finishing stamps the account and opens Today", async () => {
    window.localStorage.setItem("sparehour.first-run.hours", "u1");
    const user = userEvent.setup();
    render(<WelcomePage />);
    await user.click(screen.getByRole("button", { name: "Brain dump" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/today"));
    expect(settingsRow().onboarded_at).toMatch(/^2\d{3}-/);
    expect(window.localStorage.getItem("sparehour.first-run.hours")).toBeNull();
  });

  it("an account that is already set up goes to Today", () => {
    h.db.rows("update user_settings set onboarded_at = '2026-10-01T00:00:00Z' where id = 'row1'");
    render(<WelcomePage />);
    expect(h.replace).toHaveBeenCalledWith("/today");
    expect(screen.queryByRole("heading", { name: "When do you work?" })).not.toBeInTheDocument();
  });
});
