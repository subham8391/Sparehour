// The Week tab as the phone draws it: the range and the total, the strip, the stacked days with their readouts, the
// folded free days, what lies past the week, "Not yet planned", and what each control calls. The week is
// week-fixture.ts: made-up tasks, with every figure the shared capacity engine's own.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { TODAY, task, weekFixture } from "./week-fixture";
import { WeekView, type WeekViewProps } from "./week-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const props = (over: Partial<WeekViewProps> = {}, week = weekFixture()): WeekViewProps => ({
  part: "afternoon",
  eyebrow: "Upcoming · rolling 7 days",
  title: week.title,
  totalLine: week.totalLine,
  mode: "rolling",
  offset: 0,
  today: TODAY,
  days: week.days,
  later: week.later,
  laterReadouts: week.laterReadouts,
  unplanned: week.unplanned,
  nextDays: week.nextDays,
  projectNames: week.projectNames,
  defaultEstimateMin: 35,
  waiting: false,
  noneAhead: week.noneAhead,
  onMode: jest.fn(),
  onStep: jest.fn(),
  onThisWeek: jest.fn(),
  onComplete: jest.fn(),
  onOpen: jest.fn(),
  onOpenDay: jest.fn(),
  onAdd: jest.fn(),
  onPlace: jest.fn(),
  ...over,
});
const day = (ahead: number) => TODAY.add({ days: ahead });
const strip = () => within(screen.getByLabelText("Jump to a day"));

describe("<WeekView>", () => {
  it("shows the range, the week's spare total and a strip cell per day, each named with its readout in words", async () => {
    await render(<WeekView {...props()} />);
    expect(screen.getByText("UPCOMING · ROLLING 7 DAYS")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Sat 21 – Fri 27 November" })).toBeTruthy();
    expect(screen.getByText("29h 55m spare this week")).toBeTruthy();
    expect(strip().getAllByRole("button")).toHaveLength(7);
    expect(strip().getByRole("button", { name: "Sat 21, today, no working hours" })).toBeTruthy();
    expect(strip().getByRole("button", { name: "Mon 23, 55 minutes over" })).toBeTruthy();
    expect(strip().getByRole("button", { name: "Wed 25, 6 hours 55 minutes spare" })).toBeTruthy();
  });

  it("stacks the days: today marked, each with its count, its planned time, its readout and its rows, the evening's last", async () => {
    await render(<WeekView {...props()} />);
    expect(screen.getByRole("header", { name: /^SAT 21 1 · today · 15m$/ })).toBeTruthy();
    const monday = within(screen.getByTestId("day-2026-11-23"));
    expect(monday.getByRole("header", { name: /^MON 23 4 · 9h 05m$/ })).toBeTruthy();
    expect(monday.getByText("55m over")).toBeTruthy();
    expect(monday.getByTestId("day-bar-over", { includeHiddenElements: true })).toBeTruthy();
    const titles = monday.getAllByRole("button", { name: /^(Write the quarterly|Call the bank|Review the budget|Read two chapters)/ }).map((b) => b.props.accessibilityLabel);
    expect(titles).toEqual(["Write the quarterly report for the board", "Call the bank", "Review the budget", "Read two chapters"]);
    expect(monday.getByText("Acme")).toBeTruthy();
    expect(monday.getByText("Home · @calls")).toBeTruthy();
    expect(monday.getByLabelText("No estimate, counted as 35m")).toBeTruthy();
    // A single free day keeps its own header and says "Free."; a day with no working hours says so and draws a flat track.
    const sunday = within(screen.getByTestId("day-2026-11-22"));
    expect(sunday.getByText("Free.")).toBeTruthy();
    expect(sunday.getByText("no working hours")).toBeTruthy();
    expect(sunday.getByTestId("day-bar-off", { includeHiddenElements: true })).toBeTruthy();
  });

  it("lists what is due on a day it is not planned for, and folds what starts that day until it is opened", async () => {
    await render(<WeekView {...props()} />);
    const monday = within(screen.getByTestId("day-2026-11-23"));
    expect(monday.getByRole("header", { name: "DUE" })).toBeTruthy();
    expect(monday.getByRole("button", { name: "Submit the expenses" })).toBeTruthy();
    const wednesday = within(screen.getByTestId("day-2026-11-25"));
    expect(wednesday.queryByText("Start the tax return")).toBeNull();
    await fireEvent.press(wednesday.getByRole("button", { name: "Starting later, 1" }));
    expect(wednesday.getByText("Start the tax return")).toBeTruthy();
  });

  it("folds a run of free days into one line of day cells; a tap on the strip unfolds the day it jumps to", async () => {
    const p = props();
    await render(<WeekView {...p} />);
    expect(screen.getByRole("header", { name: "THU 26 – FRI 27 · free" })).toBeTruthy();
    expect(screen.queryByTestId("day-2026-11-26")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add a task on Fri 27" }));
    expect(p.onAdd).toHaveBeenCalledWith(day(6));
    await fireEvent.press(strip().getByRole("button", { name: "Thu 26, 7 hours 40 minutes spare" }));
    expect(screen.getByTestId("day-2026-11-26")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "THU 26 – FRI 27 · free" })).toBeNull();
  });

  it("a row completes and opens its task; a day's header adds a task on it and opens the day", async () => {
    const p = props();
    await render(<WeekView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Call the bank" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Call the bank" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add a task on Mon 23" }));
    expect(p.onAdd).toHaveBeenCalledWith(day(2));
    await fireEvent.press(screen.getByRole("button", { name: "Open Mon 23" }));
    expect(p.onOpenDay).toHaveBeenCalledWith(day(2));
  });

  it("steps a week, never before this one, switches to the calendar week and comes back to this week", async () => {
    const p = props();
    const view = await render(<WeekView {...p} />);
    expect(screen.getByRole("button", { name: "Previous week" }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(p.onStep).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Next week" }));
    expect(p.onStep).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("button", { name: "Back to this week" })).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Calendar week" }));
    expect(p.onMode).toHaveBeenCalledWith("calendar");

    const next = props({ offset: 1 }, weekFixture({ offset: 1 }));
    await view.rerender(<WeekView {...next} />);
    expect(screen.getByRole("header", { name: "Sat 28 Nov – Fri 4 Dec" })).toBeTruthy();
    expect(screen.getByText(/spare that week$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(next.onStep).toHaveBeenCalledWith(-1);
    await fireEvent.press(screen.getByRole("button", { name: "Back to this week" }));
    expect(next.onThisWeek).toHaveBeenCalledTimes(1);
  });

  it("keeps going past the week by month, with a readout while a day is within two weeks", async () => {
    await render(<WeekView {...props()} />);
    expect(screen.getByRole("header", { name: /^LATER THIS MONTH 1$/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Mon 30 Nov · 1h 30m" })).toBeTruthy();
    expect(screen.getByText("6h 10m spare")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Renew the domain" })).toBeTruthy();
    expect(screen.getByRole("header", { name: /^NEXT MONTH 1$/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Tue 15 Dec · 10m" })).toBeTruthy();
  });

  it("the calendar week shows a day already gone for what is still dated there: no readout, nothing new, and its empty days are no jump", async () => {
    await render(<WeekView {...props({ mode: "calendar", eyebrow: "Upcoming · calendar week" }, weekFixture({ mode: "calendar" }))} />);
    expect(screen.getByRole("header", { name: "Mon 16 – Sun 22 November" })).toBeTruthy();
    const gone = within(screen.getByTestId("day-2026-11-18"));
    expect(gone.getByRole("button", { name: "Send the invoice" })).toBeTruthy();
    expect(gone.queryByText(/spare$|over$|working hours$/)).toBeNull();
    expect(gone.queryByRole("button", { name: "Add a task on Wed 18" })).toBeNull();
    expect(screen.queryByTestId("day-2026-11-16")).toBeNull();
    expect(strip().getByRole("button", { name: "Mon 16" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(strip().getByRole("button", { name: "Wed 18" }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("Not yet planned is a strip that opens a sheet where a tap on a day places the task there", async () => {
    const p = props();
    await render(<WeekView {...p} />);
    expect(screen.queryByText("Tap a day to give a task its place in the week.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Not yet planned, 2" }));
    expect(screen.getByRole("header", { name: "Not yet planned · 2" })).toBeTruthy();
    expect(screen.getByText("Tap a day to give a task its place in the week.")).toBeTruthy();
    const cells = within(screen.getByLabelText("Move “Research CalDAV” to"));
    expect(cells.getAllByRole("button")).toHaveLength(7);
    await fireEvent.press(cells.getByRole("button", { name: "Wed 25, 6 hours 55 minutes spare" }));
    expect(p.onPlace).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), day(4));
    // "Pick a date" opens a month under the task for any other day; a day already gone cannot be chosen.
    await fireEvent.press(screen.getByRole("button", { name: "Pick a date for Birthday gift for Ana" }));
    expect(screen.getByRole("button", { name: /^Friday 20 November 2026/ }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole("button", { name: /^Monday 30 November 2026/ }));
    expect(p.onPlace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "u2" }), day(9));
  });

  it("an empty week says so and offers Add a task, or Plan your week when tasks wait for a day", async () => {
    const empty = weekFixture({ empty: true });
    const p = props({}, empty);
    const view = await render(<WeekView {...p} />);
    expect(screen.getByText("Nothing scheduled beyond today.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Not yet planned/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add a task" }));
    expect(p.onAdd).toHaveBeenCalledWith(null);

    await view.rerender(<WeekView {...props({ unplanned: [task("u9", "Tidy the archive")] }, empty)} />);
    await fireEvent.press(screen.getByRole("button", { name: "Plan your week" }));
    expect(screen.getByRole("header", { name: "Not yet planned · 1" })).toBeTruthy();
  });

  it("a phone still waiting for its first sync says so rather than call the week empty", async () => {
    await render(<WeekView {...props({ waiting: true, noneAhead: false }, weekFixture({ empty: true }))} />);
    expect(screen.getByText("Getting your tasks…")).toBeTruthy();
    expect(screen.queryByLabelText("Jump to a day")).toBeNull();
    expect(screen.queryByText("Nothing scheduled beyond today.")).toBeNull();
  });
});
