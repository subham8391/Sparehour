// @vitest-environment jsdom
// Settings › Notifications: under Quiet hours, the coming week's reminders they hold back, following the two times
// as they stand in the fields (docs/product/REMINDERS_AND_AI_SPEC.md §1).
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComingBlockRow } from "@/data/queries/blocks";
import { SETTINGS_VALUES, WORK_WEEK } from "@/test/settings";
import type { SettingsFormProps, SettingsValues } from "../types";

const h = vi.hoisted(() => ({ rows: [] as unknown[], asked: [] as unknown[][] }));
vi.mock("@/data/powersync", () => ({
  useQuery: (_sql: string, params: unknown[]) => {
    h.asked.push(params);
    return { data: h.rows };
  },
}));
// A Thursday, at noon.
vi.mock("@/features/shell/use-local-day", async () => {
  const { instant: at } = await import("@/core/time");
  const now = at("2026-11-26T12:00:00Z");
  return { useNow: () => now };
});

const { NotificationsSection } = await import("./notifications-section");

const block = (id: string, start: string, task: string | null, own: string | null = null): ComingBlockRow => ({ id, start_at: start, task_title: task, block_title: own });
// Quiet from 21:00 to 08:00 in London (on UTC in November), reminders five minutes before a block.
const VALUES: SettingsValues = { ...SETTINGS_VALUES, blockStartLeadMin: 5 };
const props = (values: SettingsValues = VALUES) => ({ values, workHours: WORK_WEEK, detectedTimeZone: null, account: { name: "Dev User", email: "dev@sparehour.local" }, onChange: vi.fn(), onWorkHours: vi.fn(), onSignOut: vi.fn() }) as SettingsFormProps;

beforeEach(() => {
  h.rows = [];
  h.asked = [];
});

describe("Settings › Notifications and the reminders quiet hours hold back", () => {
  it("names the held reminders under Quiet hours, in the hint's ink", () => {
    h.rows = [block("b1", "2026-11-26T21:30:00Z", "Vitamin D3"), block("b2", "2026-11-27T07:30:00Z", "going to gym"), block("b3", "2026-11-27T13:00:00Z", "Lunch")];
    render(<NotificationsSection {...props()} />);
    const line = screen.getByTestId("held-line");
    expect(line).toHaveTextContent("Held back now: Vitamin D3 (Thu 21:25), going to gym (Fri 07:25).");
    expect(line).toHaveClass("text-ink-2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // In the Quiet hours row, after its two fields.
    const end = screen.getByLabelText("Quiet hours end");
    expect(end.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The device is asked for the coming week's dates, a day wider at each end.
    expect(h.asked.at(-1)).toEqual(["2026-11-25", "2026-12-04"]);
  });

  it("says nothing when none is held", () => {
    h.rows = [block("b3", "2026-11-27T13:00:00Z", "Lunch")];
    const { rerender } = render(<NotificationsSection {...props()} />);
    expect(screen.queryByTestId("held-line")).not.toBeInTheDocument();
    h.rows = [];
    rerender(<NotificationsSection {...props()} />);
    expect(screen.queryByTestId("held-line")).not.toBeInTheDocument();
  });

  it("follows the two times, the lead and the switch as they are changed", () => {
    h.rows = [block("b1", "2026-11-26T21:30:00Z", "Vitamin D3"), block("b2", "2026-11-27T07:30:00Z", "going to gym")];
    const { rerender } = render(<NotificationsSection {...props()} />);
    expect(screen.getByTestId("held-line")).toHaveTextContent("Held back now: Vitamin D3 (Thu 21:25), going to gym (Fri 07:25).");
    // Quiet hours start an hour later: the evening reminder comes.
    rerender(<NotificationsSection {...props({ ...VALUES, quietHoursStart: "22:00" })} />);
    expect(screen.getByTestId("held-line")).toHaveTextContent("Held back now: going to gym (Fri 07:25).");
    // And end an hour earlier: both come.
    rerender(<NotificationsSection {...props({ ...VALUES, quietHoursStart: "22:00", quietHoursEnd: "07:00" })} />);
    expect(screen.queryByTestId("held-line")).not.toBeInTheDocument();
    // At the start of the block instead: the time said is the block's own.
    rerender(<NotificationsSection {...props({ ...VALUES, blockStartLeadMin: 0 })} />);
    expect(screen.getByTestId("held-line")).toHaveTextContent("Held back now: Vitamin D3 (Thu 21:30), going to gym (Fri 07:30).");
    // Block reminders off, or no quiet hours: nothing to hold.
    rerender(<NotificationsSection {...props({ ...VALUES, notifyBlockStart: false })} />);
    expect(screen.queryByTestId("held-line")).not.toBeInTheDocument();
    rerender(<NotificationsSection {...props({ ...VALUES, quietHoursStart: "", quietHoursEnd: "" })} />);
    expect(screen.queryByTestId("held-line")).not.toBeInTheDocument();
  });

  it("names three and counts the rest", () => {
    h.rows = [
      block("b1", "2026-11-27T07:30:00Z", "A"),
      block("b2", "2026-11-27T21:30:00Z", "B"),
      block("b3", "2026-11-28T07:30:00Z", null, "C"),
      block("b4", "2026-11-28T21:30:00Z", "D"),
      block("b5", "2026-11-29T07:30:00Z", "E"),
    ];
    render(<NotificationsSection {...props()} />);
    expect(screen.getByTestId("held-line")).toHaveTextContent("Held back now: A (Fri 07:25), B (Fri 21:25), C (Sat 07:25) and 2 more.");
  });
});
