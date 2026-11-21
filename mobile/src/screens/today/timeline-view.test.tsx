// "Your day" as the phone draws it, and every tap path a drag has on the web: the offer on an empty time and the
// "Add at" sheet behind it, a block's tools, Move… and Duplicate by a tap or by times, tap-to-schedule, and the zoom.
// The day is today-fixture.ts (nine to six, 13:20); at the default zoom an hour is 66 points.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { NOW_MIN, todayFixture } from "./today-fixture";
import { TimelineView, type TimelineViewProps } from "./timeline-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const fixture = todayFixture();
const props = (over: Partial<TimelineViewProps> = {}): TimelineViewProps => ({
  c: fixture.capacity,
  nowMin: NOW_MIN,
  nowShown: true,
  blocks: fixture.blocks,
  meetings: fixture.meetings,
  zoom: 30,
  onZoom: jest.fn(),
  dayStart: 9 * 60,
  dayEnd: 18 * 60,
  bufferPct: 15,
  selectedBlockId: null,
  onSelectBlock: jest.fn(),
  onMoveBlock: jest.fn(),
  onResizeBlock: jest.fn(),
  onDuplicateBlock: jest.fn(),
  onRemoveBlock: jest.fn(),
  onToggleLock: jest.fn(),
  onOpenTask: jest.fn(),
  onRenameBlock: jest.fn(),
  onAddBlock: jest.fn(),
  addable: fixture.addable,
  ...over,
});
/** A tap on the day at a time: at 30-minute rows a minute is 1.1 points. */
const tapAt = (hhmm: string) => fireEvent.press(screen.getByTestId("timeline-tap"), { nativeEvent: { locationY: (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 1.1 } });
const block = (name: RegExp) => screen.getByRole("button", { name });

describe("<TimelineView>: what is drawn", () => {
  it("heads the day with its working hours and buffer, and draws meetings, blocks, the free gaps, now and the finish", async () => {
    await render(<TimelineView {...props()} />);
    expect(screen.getByRole("header", { name: "Your day" })).toBeTruthy();
    expect(screen.getByText("09:00 – 18:00 · buffer 15%")).toBeTruthy();
    expect(screen.getByLabelText("Meeting: Design review, 10:00–11:00 · 1h")).toBeTruthy();
    expect(screen.getByLabelText("Meeting: 1:1 with Ana, 15:00, not answered yet")).toBeTruthy();
    expect(block(/^Block: Write the quarterly report for the board, 11:00 to 12:30$/)).toBeTruthy();
    expect(block(/^Block: Lunch, 12:30 to 13:00, locked$/)).toBeTruthy();
    expect(block(/^Block: Call the bank, 16:00 to 16:35, will sync$/)).toBeTruthy();
    expect(screen.getByText("1h 40m free")).toBeTruthy();
    expect(screen.getByText("1h 25m free · after the plan")).toBeTruthy();
    expect(within(screen.getByTestId("now-line")).getByText("13:20")).toBeTruthy();
    expect(within(screen.getByTestId("done-by")).getByText("done by 16:35")).toBeTruthy();
    expect(screen.queryByTestId("overrun")).toBeNull();
    expect(screen.getAllByTestId("outside-hours", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("pins how far the plan runs past the day when it does, and has no now line on another day", async () => {
    const over = todayFixture({ state: "over" });
    const view = await render(<TimelineView {...props({ c: over.capacity })} />);
    expect(within(screen.getByTestId("overrun")).getByText("1h 25m past the end of your day")).toBeTruthy();
    const later = todayFixture({ now: false });
    await view.rerender(<TimelineView {...props({ c: later.capacity, nowShown: false, nowMin: 0 })} />);
    expect(screen.queryByTestId("now-line")).toBeNull();
  });

  it("says why blocking is paused, and how blocks get there when the day has none", async () => {
    const view = await render(<TimelineView {...props({ note: "Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced." })} />);
    expect(screen.getByText(/^Blocking is paused until Google Calendar is reconnected/)).toBeTruthy();
    await view.rerender(<TimelineView {...props({ blocks: [], hint: true })} />);
    expect(screen.getByText(/^Tap “Block” on a task, then a time here/)).toBeTruthy();
  });

  it("zooms between 30, 15 and 5 minute rows, and stops at either end", async () => {
    const onZoom = jest.fn();
    const view = await render(<TimelineView {...props({ onZoom })} />);
    expect(screen.getByText("30m rows")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom out" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Zoom in" }));
    expect(onZoom).toHaveBeenCalledWith(15);
    await view.rerender(<TimelineView {...props({ onZoom, zoom: 5 })} />);
    expect(screen.getByText("5m rows")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Zoom out" }));
    expect(onZoom).toHaveBeenLastCalledWith(15);
  });
});

describe("<TimelineView>: a tap on an empty time", () => {
  it("offers a block at that quarter hour and writes nothing; the offer opens Add at, which asks what and how long", async () => {
    const p = props();
    await render(<TimelineView {...p} />);
    await tapAt("14:07");
    expect(p.onAddBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "New block here 14:00" }));
    expect(screen.getByRole("header", { name: "Add at 14:00" })).toBeTruthy();
    expect(screen.getByText("14:00–14:30 · 30m")).toBeTruthy();
    // The day's tasks, each with the length its next block would have; one that has a block says so.
    expect(screen.getByRole("button", { name: "Review the budget, 45m" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write the quarterly report for the board, 1h 30m, has a block" })).toBeTruthy();
    // Add is off until a task is picked or a name typed.
    expect(screen.getByRole("button", { name: "Add" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Review the budget, 45m" }));
    expect(screen.getByText("14:00–14:45 · 45m")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(p.onAddBlock).toHaveBeenCalledWith({ taskId: "t3" }, 14 * 60, 14 * 60 + 45);
    expect(screen.queryByRole("header", { name: "Add at 14:00" })).toBeNull();
  });

  it("a name typed is a block of your own at the length chosen, and lets go of a task picked", async () => {
    const p = props();
    await render(<TimelineView {...p} />);
    await tapAt("17:00");
    await fireEvent.press(screen.getByRole("button", { name: "New block here 17:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "Review the budget, 45m" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), " Deep work ");
    await fireEvent.press(screen.getByRole("button", { name: "1h" }));
    expect(screen.getByText("17:00–18:00 · 1h")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(p.onAddBlock).toHaveBeenCalledWith({ title: "Deep work" }, 17 * 60, 18 * 60);
  });

  it("with no tasks to offer it asks only for a name, and Cancel writes nothing", async () => {
    const p = props({ addable: [] });
    await render(<TimelineView {...p} />);
    await tapAt("14:00");
    await fireEvent.press(screen.getByRole("button", { name: "New block here 14:00" }));
    expect(screen.queryByText("A TASK")).toBeNull();
    expect(screen.getByText("NAME")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onAddBlock).not.toHaveBeenCalled();
    expect(screen.queryByRole("header", { name: "Add at 14:00" })).toBeNull();
  });

  it("a second tap lets go of the offer, and a day that takes no new block offers none", async () => {
    const p = props();
    const view = await render(<TimelineView {...p} />);
    await tapAt("14:00");
    await tapAt("09:30");
    expect(screen.queryByRole("button", { name: /^New block here/ })).toBeNull();
    expect(p.onSelectBlock).toHaveBeenCalledWith(null);
    await view.rerender(<TimelineView {...props({ onAddBlock: undefined })} />);
    await tapAt("14:00");
    expect(screen.queryByRole("button", { name: /^New block here/ })).toBeNull();
  });
});

describe("<TimelineView>: a block and its tools", () => {
  it("a tap on a block selects it; selected, it shows Open, Move…, Lock and Remove, each doing its one thing", async () => {
    const p = props();
    const view = await render(<TimelineView {...p} />);
    expect(screen.queryByTestId("block-tools")).toBeNull();
    await fireEvent.press(block(/^Block: Call the bank/));
    expect(p.onSelectBlock).toHaveBeenCalledWith("b3");
    await view.rerender(<TimelineView {...props({ ...p, selectedBlockId: "b3" })} />);
    const tools = within(screen.getByTestId("block-tools"));
    expect(tools.getByText("Call the bank · 16:00–16:35 · 35m")).toBeTruthy();
    await fireEvent.press(tools.getByRole("button", { name: "Open task" }));
    expect(p.onOpenTask).toHaveBeenCalledWith("t2");
    await fireEvent.press(tools.getByRole("button", { name: "Lock" }));
    expect(p.onToggleLock).toHaveBeenCalledWith("b3", true);
    await fireEvent.press(tools.getByRole("button", { name: "Remove" }));
    expect(p.onRemoveBlock).toHaveBeenCalledWith("b3");
  });

  it("Move… waits for a tap on the timeline and moves the block there, keeping its length", async () => {
    const p = props({ selectedBlockId: "b3" });
    await render(<TimelineView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to another time" }));
    expect(within(screen.getByTestId("placing-bar")).getByText("Tap a new time for “Call the bank”")).toBeTruthy();
    await tapAt("14:02");
    expect(p.onMoveBlock).toHaveBeenCalledWith("b3", 14 * 60);
    expect(p.onResizeBlock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("placing-bar")).toBeNull();
  });

  it("Cancel lets go of a waiting Move…, and a locked block says why it stays put", async () => {
    const p = props({ selectedBlockId: "b3" });
    const view = await render(<TimelineView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to another time" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("placing-bar")).toBeNull();
    await tapAt("14:00");
    expect(p.onMoveBlock).not.toHaveBeenCalled();
    await view.rerender(<TimelineView {...props({ selectedBlockId: "b2" })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Lunch to another time" }));
    expect(screen.getByText("Locked — unlock it to move it")).toBeTruthy();
    expect(screen.queryByTestId("placing-bar")).toBeNull();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeTruthy();
  });

  it("Move… can be answered with times in a sheet: a new start moves it, a new end makes it longer or shorter", async () => {
    const p = props({ selectedBlockId: "b3" });
    await render(<TimelineView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to another time" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set the times" }));
    expect(screen.getByRole("header", { name: "Move Call the bank" })).toBeTruthy();
    // From: 14:00, left as long as it was.
    await fireEvent.press(screen.getByRole("button", { name: "From" }));
    await fireEvent.press(screen.getByRole("button", { name: "14 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: /^00 minutes/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 14:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move" }));
    expect(p.onMoveBlock).toHaveBeenCalledWith("b3", 14 * 60);
    expect(screen.queryByRole("header", { name: "Move Call the bank" })).toBeNull();
  });

  it("a new end in that sheet resizes, and an end that is not after the start is refused in words", async () => {
    const p = props({ selectedBlockId: "b3" });
    await render(<TimelineView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to another time" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set the times" }));
    await fireEvent.press(screen.getByRole("button", { name: "To" }));
    await fireEvent.press(screen.getByRole("button", { name: "15 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: /^00 minutes/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 15:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByText("The end has to be after the start.")).toBeTruthy();
    expect(p.onResizeBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "To" }));
    await fireEvent.press(screen.getByRole("button", { name: "17 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 17:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move" }));
    expect(p.onResizeBlock).toHaveBeenCalledWith("b3", 16 * 60, 17 * 60);
  });

  it("⋯ holds the block's menu: Duplicate then a tap copies it there; Rename names it; a block of your own is deleted, a task's unblocked", async () => {
    const p = props({ selectedBlockId: "b3" });
    const view = await render(<TimelineView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "More block actions" }));
    expect(screen.getByRole("button", { name: "Unblock" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
    expect(within(screen.getByTestId("placing-bar")).getByText("Tap a time for a copy of “Call the bank”")).toBeTruthy();
    await tapAt("09:00");
    expect(p.onDuplicateBlock).toHaveBeenCalledWith("b3", 9 * 60);
    await fireEvent.press(screen.getByRole("button", { name: "More block actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    await fireEvent.changeText(screen.getByLabelText("Block name"), "Ring the bank");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(p.onRenameBlock).toHaveBeenCalledWith("b3", "Ring the bank");
    await view.rerender(<TimelineView {...props({ selectedBlockId: "b2" })} />);
    await fireEvent.press(screen.getByRole("button", { name: "More block actions" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open task" })).toBeNull();
  });

  it("a day that has passed is drawn only: a block has no tools and an empty time offers nothing", async () => {
    const drawn = { c: fixture.capacity, nowMin: 24 * 60, nowShown: false, blocks: fixture.blocks, meetings: fixture.meetings, zoom: 30 as const, onZoom: jest.fn(), dayStart: 540, dayEnd: 1080, selectedBlockId: "b3" };
    await render(<TimelineView {...drawn} />);
    expect(within(screen.getByTestId("block-tools")).queryByRole("button")).toBeNull();
    await tapAt("14:00");
    expect(screen.queryByRole("button", { name: /^New block here/ })).toBeNull();
  });
});

describe("<TimelineView>: a task waiting for a time", () => {
  it("says what is waiting, places it where the next tap falls, and Cancel lets go", async () => {
    const p = props({ placing: { title: "Review the budget" }, onTapSlot: jest.fn(), onCancelPlacing: jest.fn() });
    await render(<TimelineView {...p} />);
    expect(within(screen.getByTestId("placing-bar")).getByText("Tap a time for “Review the budget”")).toBeTruthy();
    await tapAt("14:32");
    expect(p.onTapSlot).toHaveBeenCalledWith(14 * 60 + 30);
    expect(screen.queryByRole("button", { name: /^New block here/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onCancelPlacing).toHaveBeenCalledTimes(1);
  });
});

describe("<TimelineView>: Plan my day's proposal, and a meeting picked on the ribbon", () => {
  it("draws each proposed block as a ghost at its time, hidden from a screen reader and not a control", async () => {
    await render(<TimelineView {...props({ proposed: [{ key: "t3", title: "Review the budget", start: 16 * 60 + 35, end: 17 * 60 + 20 }] })} />);
    expect(screen.queryByTestId("plan-ghost")).toBeNull();
    const ghost = screen.getByTestId("plan-ghost", { includeHiddenElements: true });
    expect(within(ghost).getByText("Review the budget", { includeHiddenElements: true })).toBeTruthy();
    expect(ghost.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ top: (16 * 60 + 35) * 1.1 + 1 })]));
    expect(screen.queryByRole("button", { name: /Review the budget/ })).toBeNull();
  });

  it("draws none while nothing is proposed", async () => {
    await render(<TimelineView {...props()} />);
    expect(screen.queryByTestId("plan-ghost", { includeHiddenElements: true })).toBeNull();
  });

  it("marks the meeting that was picked, and no other", async () => {
    await render(<TimelineView {...props({ shownMeeting: 10 * 60 })} />);
    const marked = screen.getAllByTestId("meeting").filter((m) => m.props.accessibilityState?.selected);
    expect(marked.map((m) => m.props.accessibilityLabel)).toEqual([expect.stringContaining("Design review")]);
  });
});
