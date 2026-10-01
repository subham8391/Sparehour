// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlanBlock, PlanInput } from "@/core/planning";
import { localTime } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import { BlockRepo } from "@/data/repositories/block-repo";
import { Timeline } from "@/features/today/timeline";
import { UndoProvider, useUndo, useUndoSink } from "@/features/undo/undo-provider";
import { NOW, TODAY, capacityFixture } from "@/test/fixtures";
import type { PlanDrawing } from "./drawing";
import { isoAt, planTask } from "./plan-input";
import { DIDNT_FIT_LABEL, PROPOSED_LABEL, PlanPreview, type PlanWriter } from "./plan-preview";
import { taskFixture } from "@/test/fixtures";

// Monday 14 Sep, 08:00 UTC: a morning from 09:00 to 12:00 with a meeting at 10:00.
const draft = taskFixture("t1", "Draft the proposal", { priority: 3, estimateMin: 45 });
const deck = taskFixture("t2", "Review the deck", { estimateMin: 30, daySortKey: "a1" });
const drive = taskFixture("t3", "Reorganise the shared drive", { estimateMin: 90, daySortKey: "a2" });

function base(over: Partial<PlanInput> = {}): PlanInput {
  return {
    day: TODAY,
    capacity: { windows: [{ start: 540, end: 720 }], busy: [{ start: 600, end: 630 }] },
    blocks: [],
    candidates: [draft, deck, drive].map((t) => planTask(t, TODAY)),
    settings: { timezone: "UTC", maxBlockMin: 90, minBlockMin: 25, defaultEstimateMin: 30, eveningStartsAt: localTime("18:00"), bufferPct: 0 },
    now: NOW.subtract({ minutes: 90 }),
    ...over,
  };
}

function writer() {
  return {
    approve: vi.fn<PlanWriter["approve"]>(async () => {}),
    tomorrow: vi.fn<PlanWriter["tomorrow"]>(),
    someday: vi.fn<PlanWriter["someday"]>(),
    keep: vi.fn<PlanWriter["keep"]>(),
  };
}

function setup(over: Partial<PlanInput> = {}, extra: { blockTitles?: Map<string, string> } = {}) {
  const w = writer();
  const onClose = vi.fn();
  const onDrawing = vi.fn();
  render(<PlanPreview mode="plan" base={base(over)} blockTitles={extra.blockTitles} layout="dock" writer={w} toIso={(m) => isoAt(TODAY, m, "UTC")} onDrawing={onDrawing} onClose={onClose} />);
  return { w, onClose, onDrawing, user: userEvent.setup() };
}

const proposed = () => within(screen.getByRole("list", { name: PROPOSED_LABEL }));
const didntFit = () => within(screen.getByRole("list", { name: DIDNT_FIT_LABEL }));

describe("<PlanPreview>", () => {
  it("lists each proposed block with its time, title and explanation, and says nothing is written yet", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Plan my day" })).toHaveFocus();
    expect(screen.getByText("2 blocks · 1h 15m. Nothing changes until you approve.")).toBeInTheDocument();
    const rows = proposed().getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "09:00–09:45Draft the proposalHigh priority.",
      "10:30–11:00Review the deckThis is the only free gap left that fits it.",
    ]);
    expect(screen.getByText("Left 1h 15m unplanned.")).toBeInTheDocument();
  });

  it("hands the timeline its ghosts, which draw as dashed blocks that are not there yet", () => {
    const { onDrawing } = setup();
    const drawing = onDrawing.mock.calls.at(-1)![0] as PlanDrawing;
    expect(drawing.ghosts.map((g) => [g.key, g.title, g.start, g.end])).toEqual([
      ["t1", "Draft the proposal", 540, 585],
      ["t2", "Review the deck", 630, 660],
    ]);
    expect(drawing.free).toEqual([
      { start: 585, end: 600 },
      { start: 660, end: 720 },
    ]);
    render(<Timeline c={{ ...capacityFixture, free: [...drawing.free] }} now={NOW} zone="UTC" proposed={drawing.ghosts} />);
    const ghosts = screen.getAllByTestId("plan-ghost");
    expect(ghosts).toHaveLength(2);
    expect(ghosts[0]).toHaveTextContent("Draft the proposal");
    expect(ghosts[0]).toHaveAttribute("aria-hidden", "true");
    expect(ghosts[0].className).toMatch(/border-dashed/);
    expect(ghosts[0].className).toMatch(/border-block-fill/);
    expect(ghosts[0].className).not.toMatch(/spare/);
  });

  it("Approve writes every block in one call with its task and times, then closes", async () => {
    const { w, onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(w.approve).toHaveBeenCalledTimes(1);
    expect(w.approve).toHaveBeenCalledWith(
      [
        { taskId: "t1", title: "Draft the proposal", startAt: "2026-09-14T09:00:00Z", endAt: "2026-09-14T09:45:00Z" },
        { taskId: "t2", title: "Review the deck", startAt: "2026-09-14T10:30:00Z", endAt: "2026-09-14T11:00:00Z" },
      ],
      [],
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("Approve some writes only the ticked blocks", async () => {
    const { w, user } = setup();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve some" }));
    expect(screen.getByRole("button", { name: "Approve some" })).toHaveAttribute("aria-pressed", "true");
    const draftBox = screen.getByRole("checkbox", { name: "Include Draft the proposal, 09:00–09:45" });
    expect(draftBox).toBeChecked();
    await user.click(draftBox);
    await user.click(screen.getByRole("button", { name: "Approve 1 of 2" }));
    expect(w.approve).toHaveBeenCalledWith([{ taskId: "t2", title: "Review the deck", startAt: "2026-09-14T10:30:00Z", endAt: "2026-09-14T11:00:00Z" }], []);
  });

  it("Discard closes and writes nothing", async () => {
    const { w, onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    for (const fn of Object.values(w)) expect(fn).not.toHaveBeenCalled();
  });

  it("Escape discards too", () => {
    const { w, onClose } = setup();
    fireEvent.keyDown(screen.getByRole("heading", { name: "Plan my day" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(w.approve).not.toHaveBeenCalled();
  });

  it("lists what didn't fit with the reason and one-tap Tomorrow and Someday", async () => {
    const { w, user } = setup();
    const row = didntFit().getByRole("listitem");
    expect(row).toHaveTextContent("Reorganise the shared drive · 1h 30m");
    expect(row).toHaveTextContent("No gap left today. It stays on Today and will carry over quietly.");
    await user.click(within(row).getByRole("button", { name: "Move Reorganise the shared drive to tomorrow" }));
    expect(w.tomorrow).toHaveBeenCalledWith("t3");
    await user.click(within(row).getByRole("button", { name: "Move Reorganise the shared drive to Someday" }));
    expect(w.someday).toHaveBeenCalledWith("t3");
    expect(w.approve).not.toHaveBeenCalled();
  });

  it("removing a block re-plans around it, and Put back brings it back", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Remove Draft the proposal from the plan" }));
    expect(proposed().getAllByRole("listitem").map((r) => r.querySelector("span")?.textContent)).toEqual(["09:00–09:30", "10:30–12:00"]);
    expect(proposed().getByText("Review the deck")).toBeInTheDocument();
    // With the morning free again, the long task fits after the meeting.
    expect(proposed().getByText("Reorganise the shared drive")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: DIDNT_FIT_LABEL })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Put Draft the proposal back in the plan" }));
    expect(proposed().getByText("Draft the proposal")).toBeInTheDocument();
  });

  it("names the plan's earlier blocks it replaces, and Keep locks one in place", async () => {
    const earlier: PlanBlock = { id: "b-old", taskId: "t2", start: 660, end: 690, locked: false, source: "plan" };
    const { w, user } = setup({ blocks: [earlier] }, { blockTitles: new Map([["b-old", "Review the deck"]]) });
    expect(screen.getByText("Approving replaces an earlier plan block. Keep one to lock it where it is.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep Review the deck at 11:00" }));
    expect(w.keep).toHaveBeenCalledWith("b-old");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(w.approve.mock.calls[0][1]).toEqual(["b-old"]);
  });

  it("Shuffle shows a different arrangement, or says there is only one", async () => {
    const { user } = setup({ capacity: { windows: [{ start: 540, end: 720 }], busy: [] }, candidates: [deck, drive].map((t) => planTask(t, TODAY)) });
    const before = proposed().getAllByRole("listitem").map((r) => r.textContent);
    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    const after = proposed().getAllByRole("listitem").map((r) => r.textContent);
    expect(after).not.toEqual(before);
    expect(after).toHaveLength(2);
  });

  it("says when Shuffle has nothing else to offer", async () => {
    const { user } = setup({ capacity: { windows: [{ start: 540, end: 570 }], busy: [] }, candidates: [planTask(deck, TODAY)] });
    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(screen.getByRole("status")).toHaveTextContent("This is the only arrangement that fits.");
  });

  it("on a day with no working hours, says so and offers nothing to approve", () => {
    setup({ capacity: { windows: [], busy: [] } });
    expect(screen.getByText("No working hours today, so there is nothing to plan around.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("re-plan reads as such", () => {
    render(<PlanPreview mode="replan" base={base()} layout="inline" writer={writer()} toIso={(m) => isoAt(TODAY, m, "UTC")} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Re-plan the rest of today" })).toBeInTheDocument();
  });
});

describe("Approve and undo, with the real block repository", () => {
  function txDb() {
    const execute = vi.fn().mockResolvedValue({});
    const getAll = vi.fn().mockResolvedValue([]);
    const writeTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getAll }));
    return { db: { writeTransaction } as unknown as LocalDatabase, execute, writeTransaction };
  }

  function Harness({ db }: { db: LocalDatabase }) {
    const sink = useUndoSink();
    const undo = useUndo();
    const [open, setOpen] = useState(true);
    const repo = new BlockRepo(db, sink ?? undefined);
    const w: PlanWriter = {
      approve: async (blocks, replaces) => {
        await repo.approvePlan({ spaceId: "s1", userId: "u1", blocks, replaces });
      },
      tomorrow: vi.fn(),
      someday: vi.fn(),
      keep: vi.fn(),
    };
    return (
      <>
        {open && <PlanPreview mode="plan" base={base()} layout="dock" writer={w} toIso={(m) => isoAt(TODAY, m, "UTC")} onClose={() => setOpen(false)} />}
        <button type="button" onClick={() => void undo.undo()}>
          Undo last
        </button>
      </>
    );
  }

  it("writes the batch in one transaction as one undo entry, and undo removes the whole batch", async () => {
    const { db, execute, writeTransaction } = txDb();
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <Harness db={db} />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(writeTransaction).toHaveBeenCalledTimes(1);
    const inserted = execute.mock.calls.filter(([sql]) => /insert into time_blocks/.test(String(sql))).map(([, args]) => args[0]);
    expect(inserted).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Planned 2 blocks");
    expect(screen.queryByTestId("plan-preview")).not.toBeInTheDocument();
    execute.mockClear();
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Undo last" }));
    });
    expect(writeTransaction).toHaveBeenCalledTimes(2);
    const [sql, args] = execute.mock.calls[0];
    expect(String(sql)).toMatch(/update time_blocks set deleted_at = \?/);
    expect(args.slice(2)).toEqual(inserted);
  });
});
