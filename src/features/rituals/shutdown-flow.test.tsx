// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { ShutdownFlow, type ShutdownFlowProps } from "./shutdown-flow";

const task = (id: string, title: string, estimateMin: number | null, state: Task["state"] = "active"): Task => ({
  id: id as TaskId,
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
  title,
  notes: null,
  state,
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
});

function setup(over: Partial<ShutdownFlowProps> = {}) {
  const handlers = {
    onCarry: vi.fn(),
    onCarryAll: vi.fn(),
    onRating: vi.fn(),
    onHighlight: vi.fn(),
    onPlanTomorrow: vi.fn(),
    onClose: vi.fn(),
    onSkip: vi.fn(),
  };
  const props: ShutdownFlowProps = {
    done: [task("d1", "Reply to Priya", 15, "done"), task("d2", "Draft the proposal", 90, "done")],
    unfinished: [task("u1", "Book dentist", 10), task("u2", "Research CalDAV", 60)],
    defaultEstimateMin: 30,
    rating: null,
    highlight: "",
    tomorrow: { spareMin: 250, planned: 3 },
    ...handlers,
    ...over,
  };
  render(<ShutdownFlow {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("<ShutdownFlow>", () => {
  it("walks the six steps in order with Next, Back and the dots", async () => {
    const { user } = setup();
    expect(screen.getByRole("heading", { name: "Done today" })).toBeInTheDocument();
    expect(screen.getByText("You finished 2 things — about 1h 45m.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Carried to tomorrow" })).toBeInTheDocument();
    expect(screen.getByText("2 things didn’t happen. That’s normal.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByRole("heading", { name: "Done today" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Step 5: Tomorrow" }));
    expect(screen.getByText("Tomorrow: 4h 10m spare, 3 things already on it.")).toBeInTheDocument();
  });

  it("carried rows offer Tomorrow · Someday · Drop, plus Move all", async () => {
    const { user, onCarry, onCarryAll } = setup();
    await user.click(screen.getByRole("button", { name: "Step 2: Carried to tomorrow" }));
    await user.click(screen.getAllByRole("button", { name: "Tomorrow" })[0]);
    expect(onCarry).toHaveBeenCalledWith("u1", "tomorrow");
    await user.click(screen.getAllByRole("button", { name: "Someday" })[1]);
    expect(onCarry).toHaveBeenCalledWith("u2", "someday");
    await user.click(screen.getByRole("button", { name: "Move all to tomorrow" }));
    expect(onCarryAll).toHaveBeenCalled();
  });

  it("rates with a tap or a number key", async () => {
    const { user, onRating } = setup();
    await user.click(screen.getByRole("button", { name: "Step 3: How was the day?" }));
    await user.click(screen.getByRole("radio", { name: "Rate 4" }));
    expect(onRating).toHaveBeenCalledWith(4);
    await user.keyboard("2");
    expect(onRating).toHaveBeenLastCalledWith(2);
  });

  it("the highlight can be typed or picked from today's completions, and is saved when moving on", async () => {
    const { user, onHighlight } = setup();
    await user.click(screen.getByRole("button", { name: "Step 4: What was worth it today?" }));
    await user.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(screen.getByRole("textbox", { name: "Highlight" })).toHaveValue("Draft the proposal");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onHighlight).toHaveBeenCalledWith("Draft the proposal");
  });

  it("closes the day at the end, and Skip leaves at any point", async () => {
    const { user, onClose, onSkip, onPlanTomorrow } = setup();
    await user.click(screen.getByRole("button", { name: "Step 5: Tomorrow" }));
    await user.click(screen.getByRole("button", { name: "Plan tomorrow now" }));
    expect(onPlanTomorrow).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Plan it in the morning" }));
    expect(screen.getByText("That’s the day. Nothing is waiting for you.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close the day" }));
    expect(onClose).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("with nothing done and nothing left, the words stay kind", () => {
    setup({ done: [], unfinished: [] });
    expect(screen.getByText(/Some days are like that/)).toBeInTheDocument();
  });
});
