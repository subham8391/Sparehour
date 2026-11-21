// Today's menus: the screen's options, and Trim today with the web's own order and readout.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { FITS_CLOSE_MS } from "@/features/today/trim-order";
import { TodayMenuSheet, TrimSheet, type TodayMenuProps, type TrimSheetProps } from "./menus";
import { task } from "./today-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

describe("<TodayMenuSheet>", () => {
  const props = (over: Partial<TodayMenuProps> = {}): TodayMenuProps => ({ open: true, onClose: jest.fn(), sort: { value: "manual", onChange: jest.fn() }, showCompleted: { value: false, onChange: jest.fn() }, onClearSlate: jest.fn(), onTrim: jest.fn(), onShareText: jest.fn(), onSettings: jest.fn(), ...over });

  it("offers the sorts with the one in force ticked, Show completed, and today's own items, closing as one is picked", async () => {
    const p = props();
    await render(<TodayMenuSheet {...p} />);
    expect(screen.getByRole("button", { name: "Manual" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Estimate" }));
    expect(p.sort?.onChange).toHaveBeenCalledWith("estimate");
    await fireEvent.press(screen.getByRole("button", { name: "Show completed" }));
    expect(p.showCompleted?.onChange).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByRole("button", { name: "Clear the slate…" }));
    await fireEvent.press(screen.getByRole("button", { name: "Trim today" }));
    await fireEvent.press(screen.getByRole("button", { name: "Share today as text" }));
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(p.onClearSlate).toHaveBeenCalledTimes(1);
    expect(p.onTrim).toHaveBeenCalledTimes(1);
    expect(p.onShareText).toHaveBeenCalledTimes(1);
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(6);
  });

  it("another day keeps only what is its own: a later one Sort and Show completed, a past one neither", async () => {
    const view = await render(<TodayMenuSheet {...props({ onClearSlate: undefined, onTrim: undefined, onShareText: undefined })} />);
    expect(screen.getByRole("button", { name: "Manual" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Trim today" })).toBeNull();
    await view.rerender(<TodayMenuSheet {...props({ sort: undefined, showCompleted: undefined, onClearSlate: undefined, onTrim: undefined, onShareText: undefined })} />);
    expect(screen.queryByRole("button", { name: "Manual" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show completed" })).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });
});

describe("<TrimSheet>", () => {
  const tasks = [task("a", "Call the bank"), task("b", "Write the report", { estimateMin: 120 }), task("c", "Review the budget", { estimateMin: 45 })];
  const props = (over: Partial<TrimSheetProps> = {}): TrimSheetProps => ({ open: true, tasks, overMin: 40, defaultEstimateMin: 35, onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn(), onClose: jest.fn(), ...over });

  it("lists today's tasks largest first with the three moves, under a live readout", async () => {
    const p = props();
    await render(<TrimSheet {...p} />);
    expect(screen.getByText("40m more than fits")).toBeTruthy();
    const names = screen.getAllByRole("button", { name: /to tomorrow$/ }).map((b) => b.props.accessibilityLabel);
    expect(names).toEqual(["Move Write the report to tomorrow", "Move Review the budget to tomorrow", "Move Call the bank to tomorrow"]);
    await fireEvent.press(screen.getByRole("button", { name: "Move Write the report to tomorrow" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move Call the bank to Someday" }));
    await fireEvent.press(screen.getByRole("button", { name: "Drop Review the budget" }));
    expect(p.onTomorrow).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(p.onSomeday).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(p.onDrop).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("reads Now fits the moment the day fits and closes itself a moment later; opened on a day that fits, it stays", async () => {
    jest.useFakeTimers();
    try {
      const p = props();
      const view = await render(<TrimSheet {...p} />);
      await view.rerender(<TrimSheet {...p} overMin={0} tasks={tasks.slice(0, 2)} />);
      expect(screen.getByText("Now fits")).toBeTruthy();
      expect(p.onClose).not.toHaveBeenCalled();
      await act(async () => void jest.advanceTimersByTime(FITS_CLOSE_MS + 10));
      expect(p.onClose).toHaveBeenCalledTimes(1);
      const fits = props({ overMin: 0 });
      await view.rerender(<TrimSheet {...fits} key="again" />);
      expect(screen.getByText("Today fits.")).toBeTruthy();
      await act(async () => void jest.advanceTimersByTime(FITS_CLOSE_MS * 3));
      expect(fits.onClose).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says so when nothing is left on today to move", async () => {
    await render(<TrimSheet {...props({ tasks: [], overMin: 20 })} />);
    expect(screen.getByText("Nothing left on today to move.")).toBeTruthy();
  });
});
