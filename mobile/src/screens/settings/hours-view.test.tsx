// Settings › Working hours as the phone draws it: each day on or off with its stretches, the day's sheet, the
// buffer with the web's preview, and the four choices under it. What an edit saves is the web's own rule.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DayRow, HoursView, type HoursViewProps } from "./hours-view";
import { VALUES, WORK_WEEK } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<HoursViewProps> = {}): HoursViewProps => ({ values: VALUES, workHours: WORK_WEEK, onChange: jest.fn(), onWorkHours: jest.fn(), ...over });

describe("<HoursView>", () => {
  it("shows each day's stretches or Off, and the buffer's preview from the longest day", async () => {
    await render(<HoursView {...props()} />);
    expect(screen.getByRole("checkbox", { name: "Monday is a working day" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Saturday is a working day" }).props.accessibilityState.checked).toBe(false);
    expect(screen.getAllByText("09:00–18:00")).toHaveLength(4);
    expect(screen.getByText("09:00–12:30, 13:30–18:00")).toBeTruthy();
    expect(screen.getAllByText("Off")).toHaveLength(2);
    expect(screen.getByText("15% · 1h 20m held back on a 9h day")).toBeTruthy();
    expect(screen.getByText("This Evening’s time runs from the end of your working hours until then.")).toBeTruthy();
  });

  it("turns a day on with the default stretch and off to nothing, and says Saved", async () => {
    const p = props();
    await render(<HoursView {...p} />);
    expect(screen.queryByText("Saved")).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Saturday is a working day" }));
    expect(p.onWorkHours).toHaveBeenCalledWith(5, [{ start: "09:00", end: "18:00" }]);
    expect(screen.getByText("Saved")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Monday is a working day" }));
    expect(p.onWorkHours).toHaveBeenCalledWith(0, []);
  });

  it("steps the buffer by five between 0 and 30", async () => {
    const p = props();
    const view = await render(<HoursView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Buffer, more" }));
    expect(p.onChange).toHaveBeenCalledWith({ bufferPct: 20 });
    await fireEvent.press(screen.getByRole("button", { name: "Buffer, less" }));
    expect(p.onChange).toHaveBeenCalledWith({ bufferPct: 10 });
    await view.rerender(<HoursView {...props({ values: { ...VALUES, bufferPct: 30 } })} />);
    expect(screen.getByRole("button", { name: "Buffer, more" }).props.accessibilityState.disabled).toBe(true);
  });

  it("sets a stretch's time in the day's sheet, and adds a second stretch an hour after the first", async () => {
    const p = props();
    await render(<HoursView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Monday hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Monday start, 09:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "08 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 08:00" }));
    expect(p.onWorkHours).toHaveBeenCalledWith(0, [{ start: "08:00", end: "18:00" }]);
    await fireEvent.press(screen.getByRole("button", { name: "Add hours" }));
    expect(p.onWorkHours).toHaveBeenLastCalledWith(0, [
      { start: "08:00", end: "18:00" },
      { start: "19:00", end: "20:00" },
    ]);
    // A lone stretch has no remove; two have one each.
    expect(screen.getByRole("button", { name: "Remove Monday 19:00–20:00" })).toBeTruthy();
  });

  it("does not save a day that ends before it starts, and says why", async () => {
    const p = props();
    await render(<HoursView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Monday hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Monday end, 18:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "07 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 07:00" }));
    expect(p.onWorkHours).not.toHaveBeenCalled();
    expect(screen.getByText("The day has to end after it starts.")).toBeTruthy();
  });

  it("writes the evening, the day's start and the week's first day from their sheets", async () => {
    const p = props();
    await render(<HoursView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Day starts at" }));
    await fireEvent.press(screen.getByRole("button", { name: "Midnight" }));
    expect(p.onChange).toHaveBeenCalledWith({ dayRolloverHour: 0 });
    await fireEvent.press(screen.getByRole("button", { name: "Week starts on" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sunday" }));
    expect(p.onChange).toHaveBeenCalledWith({ weekStart: 6 });
    await fireEvent.press(screen.getByRole("button", { name: "Evening ends at" }));
    await fireEvent.press(screen.getByRole("button", { name: "23 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 23:00" }));
    expect(p.onChange).toHaveBeenCalledWith({ eveningEndsAt: "23:00" });
  });
});

describe("<DayRow>", () => {
  it("joins overlapping stretches when the day's sheet is left, and says so", async () => {
    const onChange = jest.fn();
    await render(
      <DayRow
        name="Monday"
        segments={[
          { start: "09:00", end: "13:00" },
          { start: "12:00", end: "18:00" },
        ]}
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Monday hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith([{ start: "09:00", end: "18:00" }]);
    expect(screen.getByText("Overlapping hours were joined: 09:00–18:00.")).toBeTruthy();
  });
});
