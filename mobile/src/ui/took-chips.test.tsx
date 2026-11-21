// "Took" under a completion's toast, as the phone draws it: four lengths around what the task was counted as, More
// for the rest, one tap records it and the same tap again takes it back. The read and the write themselves are the
// web's (data/repositories/took.ts, tested there); here they are stood in for, and what they are asked is checked.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { TookRow } from "@/data/repositories/took";
import { TookChips } from "./took-chips";

const DB = { name: "the phone's database" };
const mockRow = jest.fn<Promise<TookRow | null>, unknown[]>();
const mockWrite = jest.fn<Promise<void>, unknown[]>();
const mockOld = jest.fn();
jest.mock("@/data/powersync", () => ({ useLocalDatabase: () => DB }));
jest.mock("@/data/repositories/took", () => ({ tookRow: (...args: unknown[]) => mockRow(...args), writeTook: (...args: unknown[]) => mockWrite(...args) }));
jest.mock("@/features/estimates/learned-store", () => ({ learnedIsOld: () => mockOld() }));

const ASK = { table: "tasks", id: "t1" } as const;
const SNAPSHOT = { id: "t1", title: "Write the report" };
const row = (more: Partial<TookRow> = {}): TookRow => ({ snapshot: SNAPSHOT, estimateMin: 30, actualMin: null, defaultMin: 35, ...more });
const names = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);

beforeEach(() => {
  jest.clearAllMocks();
  mockRow.mockResolvedValue(row());
  mockWrite.mockResolvedValue(undefined);
});

describe("<TookChips>", () => {
  it("offers four lengths around the estimate, then More", async () => {
    await render(<TookChips ask={ASK} />);
    expect(await screen.findByText("Took")).toBeTruthy();
    expect(mockRow).toHaveBeenCalledWith(DB, ASK);
    expect(names()).toEqual(["15m", "30m", "45m", "1h", "More"]);
  });

  it("goes by the account's default for a task with no estimate", async () => {
    mockRow.mockResolvedValue(row({ estimateMin: null, defaultMin: 60 }));
    await render(<TookChips ask={ASK} />);
    await screen.findByText("Took");
    expect(names()).toEqual(["45m", "1h", "1h 30m", "2h", "More"]);
  });

  it("a tap records the length, marks it, and gives the toast its time back; the same tap again takes it back", async () => {
    const onTouch = jest.fn();
    await render(<TookChips ask={ASK} onTouch={onTouch} />);
    await fireEvent.press(await screen.findByRole("button", { name: "45m" }));
    expect(mockWrite).toHaveBeenCalledWith(DB, ASK, SNAPSHOT, 45, null);
    expect(screen.getByRole("button", { name: "45m" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(onTouch).toHaveBeenCalledTimes(1);
    // What the estimates learned is asked for again: this length is part of it now.
    expect(mockOld).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "45m" }));
    expect(mockWrite).toHaveBeenLastCalledWith(DB, ASK, SNAPSHOT, null, 45);
    expect(screen.getByRole("button", { name: "45m" }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it("More lists every preset with the answer among them; Fewer goes back to the four", async () => {
    mockRow.mockResolvedValue(row({ actualMin: 50 }));
    await render(<TookChips ask={ASK} />);
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    expect(names()).toEqual(["15m", "30m", "45m", "50m", "1h", "1h 30m", "2h", "3h", "4h", "Fewer"]);
    expect(screen.getByRole("button", { name: "50m" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "Fewer" }));
    expect(names()).toEqual(["15m", "30m", "45m", "1h", "More"]);
  });

  it("a write that fails puts the answer back as it was", async () => {
    mockWrite.mockRejectedValue(new Error("no"));
    await render(<TookChips ask={ASK} />);
    await fireEvent.press(await screen.findByRole("button", { name: "1h" }));
    expect(await screen.findByRole("button", { name: "1h", selected: false })).toBeTruthy();
    expect(mockOld).not.toHaveBeenCalled();
  });

  it("asks nothing when the finished row is not on the phone", async () => {
    mockRow.mockResolvedValue(null);
    await render(<TookChips ask={ASK} />);
    await Promise.resolve();
    expect(screen.queryByText("Took")).toBeNull();
  });
});
