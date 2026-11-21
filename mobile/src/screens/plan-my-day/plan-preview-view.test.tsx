// Plan my day's preview as the phone draws it: what it lists and says for a made-up day (plan/plan-fixture.ts; the
// proposal is the shared scheduler's own answer), what each control calls, and that nothing is written until Approve.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";
import type { PlanInput } from "@/core/planning";
import type { PlanDrawing } from "@/features/planning/drawing";
import { planFixture } from "../plan/plan-fixture";
import { PlanPreviewPanel, type PlanPreviewPanelProps } from "./plan-preview-view";

const open = planFixture().planInput as PlanInput;
const over = planFixture({ state: "over" }).planInput as PlanInput;
const writer = () => ({ approve: jest.fn().mockResolvedValue(undefined), tomorrow: jest.fn(), someday: jest.fn(), keep: jest.fn() });
const props = (more: Partial<PlanPreviewPanelProps> = {}): PlanPreviewPanelProps => ({ mode: "plan", base: open, layout: "dock", writer: writer(), toIso: (minute) => `iso:${minute}`, onClose: jest.fn(), ...more });

describe("<PlanPreviewPanel>", () => {
  it("lists each proposed block with its time, its title and the sentence that explains it", async () => {
    await render(<PlanPreviewPanel {...props()} />);
    expect(screen.getByRole("header", { name: "Plan my day" })).toBeTruthy();
    expect(screen.getByText("2 blocks · 2h 15m. Nothing changes until you approve.")).toBeTruthy();
    const blocks = screen.getAllByTestId("plan-block");
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]).getByText(/13:20–14:50/)).toBeTruthy();
    expect(within(blocks[0]).getByText(/Write the quarterly report for the board/)).toBeTruthy();
    expect(within(blocks[0]).getByText("This is the only free gap left that fits it.")).toBeTruthy();
    expect(screen.getByText("Left 1h 10m unplanned: your 40m buffer and 30m spare.")).toBeTruthy();
  });

  it("says Re-plan once the day is under way, and hands the timeline what the proposal leaves", async () => {
    const drawn: (PlanDrawing | null)[] = [];
    await render(<PlanPreviewPanel {...props({ mode: "replan", onDrawing: (d) => void drawn.push(d) })} />);
    expect(screen.getByRole("header", { name: "Re-plan the rest of today" })).toBeTruthy();
    const last = drawn[drawn.length - 1];
    expect(last?.ghosts.map((g) => [g.title, g.start, g.end])).toEqual([
      ["Write the quarterly report for the board", 800, 890],
      ["Review the budget", 995, 1040],
    ]);
    expect(last?.replacedIds).toEqual([]);
  });

  it("Approve writes every proposed block in one go, as the instants a block row stores, and closes", async () => {
    const w = writer();
    const onClose = jest.fn();
    await render(<PlanPreviewPanel {...props({ writer: w, onClose })} />);
    expect(w.approve).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(w.approve).toHaveBeenCalledTimes(1);
    expect(w.approve).toHaveBeenCalledWith(
      [
        { taskId: "t1", title: "Write the quarterly report for the board", startAt: "iso:800", endAt: "iso:890" },
        { taskId: "t3", title: "Review the budget", startAt: "iso:995", endAt: "iso:1040" },
      ],
      [],
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Approve some gives each block a tick, and Approve then writes only the ticked ones", async () => {
    const w = writer();
    await render(<PlanPreviewPanel {...props({ writer: w })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Approve some" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Include Review the budget, 16:35–17:20" }));
    await fireEvent.press(screen.getByRole("button", { name: "Approve 1 of 2" }));
    expect(w.approve.mock.calls[0][0]).toEqual([{ taskId: "t1", title: "Write the quarterly report for the board", startAt: "iso:800", endAt: "iso:890" }]);
  });

  it("✕ takes a task out of the plan and re-plans the rest at once; Put back returns it", async () => {
    await render(<PlanPreviewPanel {...props()} />);
    await fireEvent.press(screen.getByRole("button", { name: "Remove Review the budget from the plan" }));
    expect(screen.getAllByTestId("plan-block")).toHaveLength(1);
    expect(screen.getByText("Left out: Review the budget")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Put Review the budget back in the plan" }));
    expect(screen.getAllByTestId("plan-block")).toHaveLength(2);
  });

  it("lists what did not fit with its reason and one-tap Tomorrow and Someday; a long task's first part carries its part", async () => {
    const w = writer();
    await render(<PlanPreviewPanel {...props({ base: over, writer: w })} />);
    expect(screen.getByText(/\(1 of 4\)/)).toBeTruthy();
    const unplaced = within(screen.getByTestId("plan-unplaced"));
    expect(unplaced.getByText(/Review the budget/)).toBeTruthy();
    expect(unplaced.getByText("Only part 1 of 4 fits today. The rest stays on Today and will carry over quietly.")).toBeTruthy();
    await fireEvent.press(unplaced.getByRole("button", { name: "Move Review the budget to tomorrow" }));
    expect(w.tomorrow).toHaveBeenCalledWith("t3");
    await fireEvent.press(unplaced.getByRole("button", { name: "Move Review the budget to Someday" }));
    expect(w.someday).toHaveBeenCalledWith("t3");
  });

  it("names the plan's earlier blocks that approving replaces, each with Keep, and Approve replaces them", async () => {
    const w = writer();
    // The afternoon's block for the budget was the plan's own and has not started: a new plan replaces it.
    const base: PlanInput = { ...open, blocks: [...open.blocks, { id: "old", taskId: "t3", start: 1020, end: 1065, locked: false, source: "plan" }] };
    await render(<PlanPreviewPanel {...props({ base, writer: w, blockTitles: new Map([["old", "Review the budget"]]) })} />);
    expect(screen.getByText("Approving replaces an earlier plan block. Keep one to lock it where it is.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep Review the budget at 17:00" }));
    expect(w.keep).toHaveBeenCalledWith("old");
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(w.approve.mock.calls[0][1]).toEqual(["old"]);
  });

  it("Shuffle shows another arrangement that fits as well, or says there is only the one; Discard closes with nothing written", async () => {
    const w = writer();
    const onClose = jest.fn();
    await render(<PlanPreviewPanel {...props({ writer: w, onClose })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shuffle" }));
    expect(within(screen.getAllByTestId("plan-block")[0]).getByText(/Review the budget/)).toBeTruthy();
    expect(screen.queryByText("This is the only arrangement that fits.")).toBeNull();
    await render(<PlanPreviewPanel {...props({ base: over, writer: w, onClose })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shuffle" }));
    expect(screen.getByText("This is the only arrangement that fits.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(w.approve).not.toHaveBeenCalled();
  });

  it("while blocking is paused the preview still shows, says why, and offers no Approve", async () => {
    await render(<PlanPreviewPanel {...props({ paused: "Blocking is paused until the calendar is reconnected." })} />);
    expect(screen.getByText("Blocking is paused until the calendar is reconnected.")).toBeTruthy();
    expect(screen.getAllByTestId("plan-block")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve some" })).toBeNull();
    expect(screen.getByRole("button", { name: "Shuffle" })).toBeTruthy();
  });

  it("a save that fails says nothing was changed and stays open", async () => {
    const w = { ...writer(), approve: jest.fn().mockRejectedValue(new Error("offline")) };
    const onClose = jest.fn();
    await render(<PlanPreviewPanel {...props({ writer: w, onClose })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Couldn’t save the plan. Nothing was changed.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says what there is to say when there is nothing to plan, with nothing to approve", async () => {
    await render(<PlanPreviewPanel {...props({ base: { ...open, candidates: [] } })} />);
    expect(screen.getByText("There is nothing on Today to plan.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" }).props.accessibilityState).toMatchObject({ disabled: true });
    await render(<PlanPreviewPanel {...props({ base: null })} />);
    expect(screen.getByText("Reading your day…")).toBeTruthy();
  });

  it("the phone's Back closes it, as Escape does on the web", async () => {
    Platform.OS = "android";
    const listen = jest.spyOn(BackHandler, "addEventListener");
    const onClose = jest.fn();
    await render(<PlanPreviewPanel {...props({ onClose })} />);
    const onBack = listen.mock.calls[listen.mock.calls.length - 1][1] as () => boolean | null | undefined;
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = onBack();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    listen.mockRestore();
  });

  it("is a card in the morning plan's last step, with the same words and controls", async () => {
    await render(<PlanPreviewPanel {...props({ layout: "inline" })} />);
    expect(screen.getByRole("header", { name: "Plan my day" })).toBeTruthy();
    expect(screen.getAllByTestId("plan-block")).toHaveLength(2);
    for (const name of ["Approve", "Approve some", "Shuffle", "Discard"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });
});
