// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toReminderSettings } from "@/core/notifications/quiet-hours";
import { instant, localDate } from "@/core/time";
import type { TimeBlockRow } from "@/data/schema.client";
import { BlockRows, taskBlocks } from "./block-rows";

const rows: { data: TimeBlockRow[] } = { data: [] };
const repo = { move: vi.fn(), setLocked: vi.fn(), remove: vi.fn() };
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: rows.data }) }));
vi.mock("./use-block-repo", () => ({ useBlockRepo: () => repo }));

const row = (id: string, start: string, end: string, locked = 0) => ({ id, task_id: "t1", start_at: start, end_at: end, locked, deleted_at: null }) as unknown as TimeBlockRow;
const today = localDate("2026-10-07");

beforeEach(() => {
  rows.data = [];
  for (const f of Object.values(repo)) f.mockClear();
});

describe("taskBlocks", () => {
  it("keeps the task's blocks from today on, as minutes of their own days", () => {
    const out = taskBlocks([row("old", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"), row("b1", "2026-10-07T09:30:00Z", "2026-10-07T10:15:00Z", 1), row("b2", "2026-10-09T13:00:00Z", "2026-10-09T14:00:00Z")], "UTC", today);
    expect(out.map((b) => [b.id, b.day.toString(), b.start, b.end, b.locked])).toEqual([
      ["b1", "2026-10-07", 570, 615, true],
      ["b2", "2026-10-09", 780, 840, false],
    ]);
  });
});

describe("<BlockRows> (the detail's Block rows)", () => {
  it("says nothing for a task with no blocks", () => {
    const { container } = render(<BlockRows taskId="t1" estimateMin={60} zone="UTC" today={today} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names each block with its time and lock, and its fields move and resize it", async () => {
    const user = userEvent.setup();
    rows.data = [row("b1", "2026-10-07T09:30:00Z", "2026-10-07T10:15:00Z", 1), row("b2", "2026-10-09T13:00:00Z", "2026-10-09T14:00:00Z")];
    render(<BlockRows taskId="t1" estimateMin={45} zone="UTC" today={today} />);
    const first = screen.getAllByRole("button", { name: /Blocked/ })[0];
    expect(first).toHaveTextContent("09:30–10:15 · locked");
    const second = screen.getAllByRole("button", { name: /Blocked/ })[1];
    expect(second).toHaveTextContent("13:00–14:00");
    expect(second).not.toHaveTextContent("· locked");

    // The locked one waits for Unlock.
    await user.click(first);
    expect(screen.getByLabelText("Block starts")).toBeDisabled();
    expect(screen.getByText("Locked — unlock it to change the time.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(repo.setLocked).toHaveBeenCalledWith("b1", false);
    await user.keyboard("{Escape}");

    await user.click(second);
    fireEvent.change(screen.getByLabelText("Block starts"), { target: { value: "13:30" } });
    fireEvent.change(screen.getByLabelText("Block ends"), { target: { value: "15:00" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(repo.move).toHaveBeenCalledWith("b2", "2026-10-09T13:30:00Z", "2026-10-09T15:00:00Z");
  });

  it("refuses an end before the start in the deadline role, and Remove takes the block away", async () => {
    const user = userEvent.setup();
    rows.data = [row("b1", "2026-10-07T09:30:00Z", "2026-10-07T10:15:00Z")];
    render(<BlockRows taskId="t1" estimateMin={45} zone="UTC" today={today} />);
    await user.click(screen.getByRole("button", { name: /Blocked/ }));
    fireEvent.change(screen.getByLabelText("Block ends"), { target: { value: "09:00" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("It ends before it starts.");
    expect(repo.move).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove block" }));
    expect(repo.remove).toHaveBeenCalledWith("b1");
  });

  it("a quiet line says when today's blocks and the estimate disagree, overlaps counted once", () => {
    rows.data = [row("b1", "2026-10-07T09:00:00Z", "2026-10-07T10:00:00Z"), row("b2", "2026-10-07T09:30:00Z", "2026-10-07T10:30:00Z")];
    const { rerender } = render(<BlockRows taskId="t1" estimateMin={120} zone="UTC" today={today} />);
    expect(screen.getByTestId("block-estimate-hint")).toHaveTextContent("1h 30m blocked · 30m short of the 2h estimate");
    rerender(<BlockRows taskId="t1" estimateMin={90} zone="UTC" today={today} />);
    expect(screen.queryByTestId("block-estimate-hint")).not.toBeInTheDocument();
  });
});

describe("<BlockRows> and quiet hours (REMINDERS_AND_AI_SPEC.md §1)", () => {
  // Quiet from 21:00 to 08:00, reminders five minutes before a block; the clock says 06:00.
  const quiet = toReminderSettings({ notify_block_start: 1, block_start_lead_min: 5, quiet_hours_start: "21:00", quiet_hours_end: "08:00" });
  const sixAm = instant("2026-10-07T06:00:00Z");
  const HELD = "No reminder: 07:25 is inside quiet hours (21:00–08:00).";
  const early = () => row("b1", "2026-10-07T07:30:00Z", "2026-10-07T08:00:00Z");

  it("says under a block still to come that its reminder is held, and not under one outside quiet hours", () => {
    rows.data = [early(), row("b2", "2026-10-07T13:00:00Z", "2026-10-07T14:00:00Z")];
    render(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={quiet} />);
    const notes = screen.getAllByTestId("block-held-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(HELD);
    // Under its own block: the note follows the 07:30 row and comes before the 13:00 one.
    const [first, second] = screen.getAllByRole("button", { name: /Blocked/ });
    expect(first.compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notes[0].compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A note in the secondary ink: never the deadline's red, never an alert.
    expect(notes[0]).toHaveClass("text-ink-2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Change quiet hours goes to Settings › Notifications", () => {
    rows.data = [early()];
    render(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={quiet} />);
    expect(screen.getByRole("link", { name: "Change quiet hours" })).toHaveAttribute("href", "/settings#notifications");
  });

  it("says nothing with block reminders off, with no quiet hours, or for a task no reminder is made for", () => {
    rows.data = [early()];
    const { rerender } = render(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={{ ...quiet, blockReminders: false }} />);
    expect(screen.queryByTestId("block-held-note")).not.toBeInTheDocument();
    rerender(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={toReminderSettings({ notify_block_start: 1, block_start_lead_min: 5 })} />);
    expect(screen.queryByTestId("block-held-note")).not.toBeInTheDocument();
    // A finished or parked task: the detail hands no settings.
    rerender(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={null} />);
    expect(screen.queryByTestId("block-held-note")).not.toBeInTheDocument();
    rerender(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={sixAm} reminders={quiet} />);
    expect(screen.getByTestId("block-held-note")).toBeInTheDocument();
  });

  it("says nothing once the block has started", () => {
    rows.data = [early()];
    const { rerender } = render(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={instant("2026-10-07T07:29:00Z")} reminders={quiet} />);
    expect(screen.getByTestId("block-held-note")).toHaveTextContent(HELD);
    rerender(<BlockRows taskId="t1" estimateMin={null} zone="UTC" today={today} now={instant("2026-10-07T07:30:00Z")} reminders={quiet} />);
    expect(screen.queryByTestId("block-held-note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Blocked/ })).toHaveTextContent("07:30–08:00");
  });
});
