// "Your day", wired: every tap on the timeline goes to the shared placing hook and the block repository it holds;
// blocking paused takes nothing new; a day that has passed mounts no placing at all; the zoom is the phone's own.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PlacingDay } from "@/features/blocking/use-placing";
import { DayPane, type DayPaneProps } from "./day-pane";
import { NOW_MIN, TODAY, todayFixture } from "./today-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockPlacer = {
  repo: { setLocked: jest.fn(), rename: jest.fn() },
  ready: true,
  selectedBlockId: "b3" as string | null,
  setSelectedBlockId: jest.fn(),
  placingTask: undefined as { title: string } | undefined,
  setPlacing: jest.fn(),
  tapSlot: jest.fn(),
  addable: [{ id: "t3", title: "Review the budget", minutes: 45, blocked: false }],
  addAt: jest.fn(),
  moveBlock: jest.fn(),
  resizeBlock: jest.fn(),
  duplicateBlock: jest.fn(),
  removeBlock: jest.fn(),
};
const mockUsePlacing = jest.fn((_day: PlacingDay) => mockPlacer);
const mockWrites = { on: true, off: null as "reauth" | "write_gone" | null };
const mockZoom = { saved: null as string | null, save: jest.fn() };
jest.mock("@/features/blocking/use-placing", () => ({ usePlacing: (day: PlacingDay) => mockUsePlacing(day) }));
jest.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [{ id: "b1" }] }) }));
jest.mock("@/features/today/calendar-state", () => ({ ...jest.requireActual("@/features/today/calendar-state"), useCalendarState: () => ({ issue: null, writes: mockWrites }) }));
jest.mock("./use-device-value", () => ({ useDeviceValue: () => [mockZoom.saved, mockZoom.save] }));

const fixture = todayFixture();
const props = (over: Partial<DayPaneProps> = {}): DayPaneProps => ({
  c: fixture.capacity,
  nowMin: NOW_MIN,
  nowShown: true,
  blocks: fixture.blocks.map((b) => ({ ...b, sync: null })),
  meetings: fixture.meetings,
  dayStart: 540,
  dayEnd: 1080,
  bufferPct: 15,
  hint: false,
  placing: { day: TODAY, zone: "UTC", blocks: fixture.blocks, free: fixture.capacity.free, dayStart: 540, dayEnd: 1080, nowMinute: NOW_MIN, defaultEstimateMin: 35, findTask: () => undefined },
  onOpenTask: jest.fn(),
  ...over,
});
const tapAt = (minute: number) => fireEvent.press(screen.getByTestId("timeline-tap"), { nativeEvent: { locationY: minute * 1.1 } });

beforeEach(() => {
  jest.clearAllMocks();
  mockPlacer.selectedBlockId = "b3";
  mockPlacer.placingTask = undefined;
  mockWrites.off = null;
  mockZoom.saved = null;
});

describe("<DayPane>", () => {
  it("hands the day to the placing hook, and a block's tools to it and its repository", async () => {
    const p = props();
    await render(<DayPane {...p} />);
    expect(mockUsePlacing).toHaveBeenCalledWith(expect.objectContaining({ day: TODAY, off: null }));
    await fireEvent.press(screen.getByRole("button", { name: "Lock" }));
    expect(mockPlacer.repo.setLocked).toHaveBeenCalledWith("b3", true);
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(mockPlacer.removeBlock).toHaveBeenCalledWith("b3");
    await fireEvent.press(screen.getByRole("button", { name: "Open task" }));
    expect(p.onOpenTask).toHaveBeenCalledWith("t2");
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to another time" }));
    await tapAt(14 * 60);
    expect(mockPlacer.moveBlock).toHaveBeenCalledWith("b3", 14 * 60);
  });

  it("a tap on an empty time asks first, and Add goes to the placing hook's addAt with the task and the minutes", async () => {
    mockPlacer.selectedBlockId = null;
    await render(<DayPane {...props()} />);
    await tapAt(14 * 60);
    await fireEvent.press(screen.getByRole("button", { name: "New block here 14:00" }));
    expect(mockPlacer.addAt).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Review the budget, 45m" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(mockPlacer.addAt).toHaveBeenCalledWith({ taskId: "t3" }, 14 * 60, 14 * 60 + 45);
  });

  it("a task waiting for a time is placed by the next tap, and Cancel lets go of it", async () => {
    mockPlacer.selectedBlockId = null;
    mockPlacer.placingTask = { title: "Review the budget" };
    await render(<DayPane {...props()} />);
    expect(screen.getByText("Tap a time for “Review the budget”")).toBeTruthy();
    await tapAt(15 * 60 + 30);
    expect(mockPlacer.tapSlot).toHaveBeenCalledWith(15 * 60 + 30);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockPlacer.setPlacing).toHaveBeenCalledWith(null);
  });

  it("marks a block whose change is still waiting to upload", async () => {
    await render(<DayPane {...props()} />);
    expect(screen.getByRole("button", { name: "Block: Write the quarterly report for the board, 11:00 to 12:30, will sync" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Block: Lunch, 12:30 to 13:00, locked" })).toBeTruthy();
  });

  it("with blocking paused it says why and takes nothing new, while a block there can still be moved or removed", async () => {
    mockWrites.off = "reauth";
    mockPlacer.placingTask = { title: "Review the budget" };
    await render(<DayPane {...props()} />);
    expect(mockUsePlacing).toHaveBeenCalledWith(expect.objectContaining({ off: expect.stringMatching(/^Blocking is paused/) }));
    expect(screen.getByText(/^Blocking is paused until Google Calendar is reconnected/)).toBeTruthy();
    // Nothing stays armed, and every block is marked not synced.
    expect(mockPlacer.setPlacing).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId("placing-bar")).toBeNull();
    expect(screen.getByRole("button", { name: "Block: Call the bank, 16:00 to 16:35, not synced" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "More block actions" }));
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
  });

  it("a day that has passed is drawn only: the placing hook is not mounted and nothing can be tapped into being", async () => {
    await render(<DayPane {...props({ readOnly: true, nowShown: false, nowMin: 24 * 60 })} />);
    expect(mockUsePlacing).not.toHaveBeenCalled();
    await tapAt(14 * 60);
    expect(screen.queryByRole("button", { name: /^New block here/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
  });

  it("draws at the zoom remembered on the phone, and remembers a new one", async () => {
    mockZoom.saved = "15";
    await render(<DayPane {...props()} />);
    expect(screen.getByText("15m rows")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Zoom in" }));
    expect(mockZoom.save).toHaveBeenCalledWith("5");
  });
});
