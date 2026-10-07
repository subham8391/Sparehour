// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
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
