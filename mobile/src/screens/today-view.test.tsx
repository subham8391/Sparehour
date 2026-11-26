// Today as the phone draws it: the day and its arrows, the hero card with the ribbon, the ritual of the hour beside
// List | Day, each section with what its rows offer, the states a day can be in, and what each control calls. The day
// is today/today-fixture.ts: made-up tasks, with every figure the shared capacity engine's own.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { Text } from "~/ui/text";
import type { Task } from "@/core/types";
import { ribbonBreakdown, ribbonShape } from "./today/ribbon-shape";
import { DoneSection } from "./today/sections";
import { NOW_MIN, TODAY, task, todayFixture } from "./today/today-fixture";
import { todayRows } from "./today-rows";
import { todaySummary } from "./today-summary";
import { TodayView, type TodayViewProps } from "./today-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const fixture = todayFixture();
const props = (over: Partial<TodayViewProps> = {}, f = fixture): TodayViewProps => ({
  part: "afternoon",
  eyebrow: "Today · Afternoon",
  title: "Wednesday 18 November",
  today: TODAY,
  summary: todaySummary(f.capacity, { trim: true }),
  ribbon: ribbonShape(f.capacity, NOW_MIN),
  rows: todayRows(f.carried, f.tasks, f.evening),
  defaultEstimateMin: 35,
  blocksByTask: f.blocksByTask,
  projectNames: f.projectNames,
  onComplete: jest.fn(),
  onMenu: jest.fn(),
  ...over,
});
/** The ribbon is drawn for the eye only, so it is hidden from a screen reader and from a plain query. */
const drawn = { includeHiddenElements: true };
/** The rows with no carried task asking, so a row's menu is the only place its actions are named. */
const plainRows = todayRows(fixture.carried.map((t) => ({ ...t, ask: false })), fixture.tasks, fixture.evening);
const moreFor = (title: string) => screen.getByRole("button", { name: `More actions for ${title}` });

describe("<TodayView>: the day and the hero", () => {
  it("shows the day, the spare figure with its line, and each section with its count and planned time", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.getByText("TODAY · AFTERNOON")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Wednesday 18 November" })).toBeTruthy();
    expect(screen.getByLabelText("2h 50m spare")).toBeTruthy();
    expect(screen.getByText(/3h 20m planned/)).toBeTruthy();
    expect(screen.getByText(/1h 30m in meetings/)).toBeTruthy();
    expect(screen.getByText("done by 16:35")).toBeTruthy();
    expect(screen.getByRole("header", { name: /CARRIED OVER 2/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: /TODAY 3 · 2h 50m/ })).toBeTruthy();
  });

  it("draws the ribbon by the hour: meetings, an unanswered invitation, blocks, what has gone, and now", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.queryByTestId("ribbon")).toBeNull();
    const ribbon = within(screen.getByTestId("ribbon", drawn));
    expect(ribbon.getAllByTestId("ribbon-meeting", drawn)).toHaveLength(2);
    expect(ribbon.getAllByTestId("ribbon-unanswered", drawn)).toHaveLength(1);
    expect(ribbon.getAllByTestId("ribbon-block", drawn)).toHaveLength(2);
    expect(ribbon.getByTestId("ribbon-elapsed", drawn)).toBeTruthy();
    expect(ribbon.getByTestId("ribbon-now", drawn)).toBeTruthy();
    expect(ribbon.getByTestId("ribbon-finish", drawn)).toBeTruthy();
    expect(ribbon.queryByTestId("ribbon-tail", drawn)).toBeNull();
    expect(ribbon.getByText("13:20", drawn)).toBeTruthy();
  });

  it("an over day says over in words, grows a tail, and its one sentence opens Trim today", async () => {
    const over = todayFixture({ state: "over" });
    const onTrim = jest.fn();
    await render(<TodayView {...props({ summary: todaySummary(over.capacity, { trim: true, suggestion: "Review the budget" }), ribbon: ribbonShape(over.capacity, NOW_MIN), onTrim }, over)} />);
    expect(screen.getByLabelText("1h 25m over")).toBeTruthy();
    expect(screen.getByTestId("ribbon-tail", drawn)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "~1h 25m spills past 18:00 — move Review the budget to tomorrow" }));
    expect(onTrim).toHaveBeenCalledTimes(1);
  });

  it("an empty today offers the morning plan from the hero, and a day with no hours says that instead of a figure", async () => {
    const empty = todayFixture({ state: "empty" });
    const onPlanDay = jest.fn();
    const view = await render(<TodayView {...props({ summary: todaySummary(empty.capacity), ribbon: ribbonShape(empty.capacity, NOW_MIN), rows: [], onPlanDay }, empty)} />);
    await fireEvent.press(screen.getByRole("link", { name: "Plan your day" }));
    expect(onPlanDay).toHaveBeenCalledTimes(1);
    const off = todayFixture({ state: "off" });
    await view.rerender(<TodayView {...props({ summary: todaySummary(off.capacity, { plannedCount: 2 }), ribbon: ribbonShape(off.capacity), rows: [] }, off)} />);
    expect(screen.getByText("No working hours today · 2 things planned")).toBeTruthy();
    expect(screen.queryByLabelText(/spare$/)).toBeNull();
    expect(screen.queryByTestId("ribbon", drawn)).toBeNull();
  });

  it("steps a day back and on, opens the options, and names the all-day events under the date", async () => {
    const p = props({ onPrevDay: jest.fn(), onNextDay: jest.fn(), allDay: ["Ana’s birthday", "Busy"] });
    await render(<TodayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await fireEvent.press(screen.getByRole("button", { name: "Next day" }));
    await fireEvent.press(screen.getByRole("button", { name: "Today options" }));
    expect(p.onPrevDay).toHaveBeenCalledTimes(1);
    expect(p.onNextDay).toHaveBeenCalledTimes(1);
    expect(p.onMenu).toHaveBeenCalledTimes(1);
    expect(screen.getByText("All day: Ana’s birthday · Busy")).toBeTruthy();
  });

  it("says the day's meetings under the all-day line, as words and not a control, and nothing with none", async () => {
    const line = "Meetings: 11:00 Daily Standup · 14:00 1:1 with Priya · +2 more";
    const view = await render(<TodayView {...props({ allDay: ["Ana’s birthday"], meetingsLine: line })} />);
    expect(screen.getByText("All day: Ana’s birthday")).toBeTruthy();
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Meetings:/ })).toBeNull();
    // With no all-day event the line still shows by itself.
    await view.rerender(<TodayView {...props({ meetingsLine: line })} />);
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByText(/^All day:/)).toBeNull();
    await view.rerender(<TodayView {...props({ meetingsLine: null })} />);
    expect(screen.queryByText(/^Meetings:/)).toBeNull();
  });

  it("another day says how far it is, with the way back, its own section name and no ritual", async () => {
    const later = todayFixture({ now: false });
    const onBack = jest.fn();
    await render(<TodayView {...props({ eyebrow: "In 2 days", title: "Friday 20 November", onBackToToday: onBack, summary: todaySummary(later.capacity, { otherDay: true }), ribbon: ribbonShape(later.capacity), rows: todayRows([], later.tasks, later.evening, "Fri"), ritual: null }, later)} />);
    expect(screen.getByText("IN 2 DAYS")).toBeTruthy();
    expect(screen.getByRole("header", { name: /^FRI 3/ })).toBeTruthy();
    expect(screen.getByTestId("ribbon", drawn)).toBeTruthy();
    expect(screen.queryByTestId("ribbon-now", drawn)).toBeNull();
    expect(screen.queryByTestId("ribbon-elapsed", drawn)).toBeNull();
    expect(screen.queryByRole("link", { name: "Morning plan" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to today" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a day that has passed reads only: a note, what was finished, no hero and nothing to plan", async () => {
    const ctx = { today: TODAY, defaultEstimateMin: 35, onComplete: jest.fn() };
    await render(<TodayView {...props({ past: true, rows: [], eyebrow: "Yesterday", done: <DoneSection label="Done on Tue 17 Nov" tasks={fixture.done} older={null} onReopen={null} ctx={ctx} /> })} />);
    expect(screen.getByText("A day that has passed, as it was: what you finished, and its blocks and meetings.")).toBeTruthy();
    expect(screen.queryByLabelText(/spare$/)).toBeNull();
    expect(screen.queryByRole("header", { name: /^TODAY/ })).toBeNull();
    expect(screen.getByRole("header", { name: /DONE 1/ })).toBeTruthy();
    expect(screen.getByText("Send the invoice")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reopen/ })).toBeNull();
  });

  it("a day that was shut down shows its summary where the hero would be", async () => {
    await render(<TodayView {...props({ closed: { line: "Closed at 18:05 · 4 done · 3h 10m · rated 4/5", highlights: "Shipped the report" } })} />);
    expect(screen.getByText("That’s the day.")).toBeTruthy();
    expect(screen.getByText("Closed at 18:05 · 4 done · 3h 10m · rated 4/5")).toBeTruthy();
    expect(screen.getByText("Worth it: Shipped the report")).toBeTruthy();
    expect(screen.queryByLabelText(/spare$/)).toBeNull();
  });
});

describe("<TodayView>: the ritual row and List | Day", () => {
  const ritual = (over: Partial<NonNullable<TodayViewProps["ritual"]>> = {}) => ({ shutdown: false, shutdownNote: null, plannedLabel: null, onPlan: jest.fn(), onShutdown: jest.fn(), ...over });

  it("offers the morning plan until it is done, then says when it was", async () => {
    const r = ritual();
    const view = await render(<TodayView {...props({ ritual: r })} />);
    expect(screen.getByText("Not planned yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "Morning plan" }));
    expect(r.onPlan).toHaveBeenCalledTimes(1);
    await view.rerender(<TodayView {...props({ ritual: ritual({ plannedLabel: "Planned at 08:42" }) })} />);
    expect(screen.getByText("Planned at 08:42")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Morning plan" })).toBeNull();
  });

  it("turns to the shutdown near the day's end, with the projected finish beside it, and offers the carried-over review", async () => {
    const r = ritual({ shutdown: true, shutdownNote: "done by 16:35", onReview: jest.fn() });
    await render(<TodayView {...props({ ritual: r })} />);
    // Once in the hero's line, once beside the ritual.
    expect(screen.getAllByText("done by 16:35")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("link", { name: "Shutdown" }));
    await fireEvent.press(screen.getByRole("button", { name: "Review carried" }));
    expect(r.onShutdown).toHaveBeenCalledTimes(1);
    expect(r.onReview).toHaveBeenCalledTimes(1);
  });

  it("switches to Day, which shows the timeline in the lists' place; a day without one has no switch", async () => {
    const onMode = jest.fn();
    const pane = () => <Text>the day’s hours</Text>;
    const view = await render(<TodayView {...props({ dayPane: pane, mode: "list", onMode })} />);
    expect(screen.queryByText("the day’s hours")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Day" }));
    expect(onMode).toHaveBeenCalledWith("day");
    await view.rerender(<TodayView {...props({ dayPane: pane, mode: "day", onMode })} />);
    expect(screen.getByText("the day’s hours")).toBeTruthy();
    expect(screen.queryByRole("header", { name: /CARRIED OVER/ })).toBeNull();
    // The hero stays over the hours.
    expect(screen.getByLabelText("2h 50m spare")).toBeTruthy();
    await view.rerender(<TodayView {...props({ mode: "day" })} />);
    expect(screen.queryByRole("radio", { name: "Day" })).toBeNull();
    expect(screen.getByRole("header", { name: /CARRIED OVER/ })).toBeTruthy();
  });
});

describe("<TodayView>: the Day view on a short phone", () => {
  const size = (height: number) => ({ width: 360, height, scale: 2, fontScale: 1 });
  afterEach(() => Dimensions.set({ window: size(1334), screen: size(1334) }));

  it("hands the hero to the timeline to scroll away with the hours, and keeps List | Day in view", async () => {
    Dimensions.set({ window: size(640), screen: size(640) });
    const pane = (above: React.ReactNode) => (
      <>
        <Text>the day’s hours</Text>
        {above}
      </>
    );
    await render(<TodayView {...props({ dayPane: pane, mode: "day" })} />);
    expect(screen.getAllByLabelText("2h 50m spare")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "List" })).toBeTruthy();
  });

  it("on a tall one the hero stays over the hours, and the timeline is handed nothing to draw above them", async () => {
    const pane = jest.fn(() => <Text>the day’s hours</Text>);
    await render(<TodayView {...props({ dayPane: pane, mode: "day" })} />);
    expect(pane).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("2h 50m spare")).toBeTruthy();
  });
});

describe("<TodayView>: the sections", () => {
  it("a row says how often it was carried, shows its project, and a task with no estimate shows the default with a question mark", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.getByText("×4")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getAllByLabelText("No estimate, counted as 35m").length).toBeGreaterThan(0);
  });

  it("a blocked row carries its block's time, said in full to a screen reader", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.getByLabelText("Blocked 11:00–12:30")).toBeTruthy();
    expect(screen.getByLabelText("Blocked 16:00–16:35")).toBeTruthy();
  });

  it("the ring completes its task, and a tap on the title opens it", async () => {
    const p = props({ onOpen: jest.fn() });
    await render(<TodayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Call the bank" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Call the bank" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
  });

  it("a carried row at the threshold asks in place of its actions, with the four answers in their order", async () => {
    const p = props({ onToday: jest.fn(), onSomeday: jest.fn(), onConvert: jest.fn(), onDrop: jest.fn() });
    await render(<TodayView {...p} />);
    expect(screen.getByText("Carried over 4 times — still want this?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More actions for Run 5k" })).toBeNull();
    const ask = within(screen.getByLabelText("Still want this?"));
    expect(ask.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    await fireEvent.press(ask.getByRole("button", { name: "Keep today" }));
    await fireEvent.press(ask.getByRole("button", { name: "Break it down" }));
    expect(p.onToday).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(p.onConvert).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("a carried row's More actions are Today, Tomorrow, Someday, Drop and Convert to project", async () => {
    const p = props({ rows: plainRows, onToday: jest.fn(), onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn(), onConvert: jest.fn() });
    await render(<TodayView {...p} />);
    await fireEvent.press(moreFor("Take B12 Vit"));
    for (const name of ["Today", "Tomorrow", "Someday", "Drop", "Convert to project"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Someday" }));
    expect(p.onSomeday).toHaveBeenCalledWith(expect.objectContaining({ id: "c2" }));
  });

  it("a day row's More actions are Move up, Move down, Tomorrow, Block and Convert to project, each only where it is offered", async () => {
    const p = props({ rows: plainRows, onMoveUp: jest.fn(), onMoveDown: jest.fn(), onTomorrow: jest.fn(), onBlock: jest.fn(), onConvert: jest.fn() });
    const view = await render(<TodayView {...p} />);
    await fireEvent.press(moreFor("Review the budget"));
    for (const name of ["Move up", "Move down", "Tomorrow", "Block", "Convert to project"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Drop" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Block" }));
    expect(p.onBlock).toHaveBeenCalledWith(expect.objectContaining({ id: "t3" }));
    // While a sort holds the rows still, and on tomorrow itself, those steps aside.
    await view.rerender(<TodayView {...props({ rows: plainRows, onConvert: jest.fn(), onBlock: jest.fn() })} />);
    await fireEvent.press(moreFor("Review the budget"));
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tomorrow" })).toBeNull();
    expect(screen.getByRole("button", { name: "Block" })).toBeTruthy();
  });

  it("Carried over has Clear the slate, and from three rows the whole-pile moves", async () => {
    const three = [...fixture.carried, task("c3", "Renew the passport", { carryCount: 1 })];
    const p = props({ rows: todayRows(three, fixture.tasks, []), onClearSlate: jest.fn(), onAllTomorrow: jest.fn(), onAllSomeday: jest.fn() });
    const view = await render(<TodayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Clear the slate" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move all to tomorrow" }));
    await fireEvent.press(screen.getByRole("button", { name: "All to Someday" }));
    expect(p.onClearSlate).toHaveBeenCalledTimes(1);
    expect(p.onAllTomorrow).toHaveBeenCalledTimes(1);
    expect(p.onAllSomeday).toHaveBeenCalledTimes(1);
    await view.rerender(<TodayView {...props()} />);
    expect(screen.queryByRole("button", { name: "Move all to tomorrow" })).toBeNull();
  });

  it("a long carried pile starts as one line until it is expanded", async () => {
    const onExpand = jest.fn();
    await render(<TodayView {...props({ carriedFolded: true, onExpandCarried: onExpand })} />);
    expect(screen.queryByText("Run 5k")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Carried over, 2. Expand" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("This evening is folded to its label, count and time until it is opened, and says when it is a full evening", async () => {
    const onToggle = jest.fn();
    const view = await render(<TodayView {...props({ eveningOpen: false, onEveningToggle: onToggle, eveningFull: true })} />);
    expect(screen.queryByText("Read two chapters")).toBeNull();
    expect(screen.getByText("That’s a full evening.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "This evening, 1, 30m" }));
    expect(onToggle).toHaveBeenCalledWith(true);
    await view.rerender(<TodayView {...props({ eveningOpen: true, onEveningToggle: onToggle })} />);
    expect(screen.getByText("Read two chapters")).toBeTruthy();
  });

  it("says once, under its row, that Google removed the block, and can put the note away", async () => {
    const onDismiss = jest.fn();
    await render(<TodayView {...props({ removed: new Set(["t3"]), onDismissRemoved: onDismiss })} />);
    expect(screen.getByText("Block removed in Google Calendar")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss the note" }));
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: "t3" }));
  });

  it("an empty day is a planning prompt with something to pull in", async () => {
    const empty = todayFixture({ state: "empty" });
    const pull = task("i1", "Book the dentist");
    const p = props({ rows: [], dayState: "empty", spareMin: 408, pullIn: [{ task: pull, source: "inbox" }], onPlanDay: jest.fn(), onToday: jest.fn() }, empty);
    await render(<TodayView {...p} />);
    expect(screen.getByText("Nothing planned for today. You have 6h 48m.")).toBeTruthy();
    expect(screen.getByText("or pull something in:")).toBeTruthy();
    expect(screen.getByText("Or tap + to add a task.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Plan my day" }));
    expect(p.onPlanDay).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Do Book the dentist today" }));
    expect(p.onToday).toHaveBeenCalledWith(pull as Task);
  });

  it("all done says so with what is left, and unfolds what could be pulled in", async () => {
    const r = { shutdown: true, shutdownNote: null, plannedLabel: null, onPlan: jest.fn(), onShutdown: jest.fn() };
    await render(<TodayView {...props({ rows: [], dayState: "all-done", spareMin: 130, pullIn: [], ritual: r })} />);
    expect(screen.getByText("That’s everything you planned. 2h 10m left.")).toBeTruthy();
    expect(screen.queryByText("Nothing waiting to pull in.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Pull something in" }));
    expect(screen.getByText("Nothing waiting to pull in.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Shutdown" }));
    expect(r.onShutdown).toHaveBeenCalledTimes(1);
  });

  it("a day with only carried tasks says nothing is planned yet", async () => {
    await render(<TodayView {...props({ rows: todayRows(fixture.carried, [], []), dayState: "planned" })} />);
    expect(screen.getByText("Nothing planned yet.")).toBeTruthy();
  });

  it("the expired digest and the calendar's line sit over the hero", async () => {
    const expired = { line: "2 time-sensitive tasks expired overnight", onReview: jest.fn(), onDismiss: jest.fn() };
    const calendar = { kind: "error" as const, message: "Couldn’t reach Google Calendar yet.", blocking: false, onRetry: jest.fn(), onDismiss: jest.fn() };
    await render(<TodayView {...props({ expired, calendar })} />);
    expect(screen.getByText("2 time-sensitive tasks expired overnight")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss for now" }));
    expect(expired.onReview).toHaveBeenCalledTimes(1);
    expect(expired.onDismiss).toHaveBeenCalledTimes(1);
    expect(calendar.onRetry).toHaveBeenCalledTimes(1);
    expect(calendar.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("asks once after the first block whether to be reminded, and a failure takes its place in words", async () => {
    const nudge = { error: null, asking: false, onYes: jest.fn(), onNotNow: jest.fn(), onClose: jest.fn() };
    const view = await render(<TodayView {...props({ blockNudge: nudge })} />);
    expect(screen.getByText("Want a nudge when this starts?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Yes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(nudge.onYes).toHaveBeenCalledTimes(1);
    expect(nudge.onNotNow).toHaveBeenCalledTimes(1);
    await view.rerender(<TodayView {...props({ blockNudge: { ...nudge, error: "Couldn’t reach Sparehour. Try again." } })} />);
    expect(screen.queryByText("Want a nudge when this starts?")).toBeNull();
    expect(screen.getByText("Couldn’t reach Sparehour. Try again.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(nudge.onClose).toHaveBeenCalledTimes(1);
  });

  it("after Yes the nudge line says reminders are being turned on, then that they are on", async () => {
    const nudge = { error: null, asking: true, done: false, onYes: jest.fn(), onNotNow: jest.fn(), onClose: jest.fn() };
    const view = await render(<TodayView {...props({ blockNudge: nudge })} />);
    expect(screen.getByText("Turning on reminders…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();
    await view.rerender(<TodayView {...props({ blockNudge: { ...nudge, asking: false, done: true } })} />);
    expect(screen.getByText("Reminders are on. You’ll get a nudge when it starts.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(nudge.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("<TodayView>: the ribbon's breakdown", () => {
  const breakdown = ribbonBreakdown(fixture.capacity, { bufferPct: 15, connected: true, meetings: fixture.meetings, blocks: fixture.blocks });
  /** A tap `x` points along a ribbon laid out 270 points wide: nine to six at half a point a minute. */
  const tap = async (x: number) => {
    const button = screen.getByRole("button", { name: "Spare time breakdown" });
    await fireEvent(button.parent!, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 270, height: 48 } } });
    await fireEvent.press(button, { nativeEvent: { locationX: x } });
  };

  it("lays one real button over the drawing, with the equation as what a screen reader hears of it", async () => {
    await render(<TodayView {...props({ breakdown })} />);
    const button = screen.getByRole("button", { name: "Spare time breakdown" });
    expect(button.props.accessibilityHint).toBe("9h working − 1h 30m in meetings − 1h 20m buffer (15% of your working day) − 3h 20m planned = 2h 50m spare");
    expect(button.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByTestId("ribbon-breakdown")).toBeNull();
  });

  it("a ribbon handed no breakdown is only drawn", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.queryByRole("button", { name: "Spare time breakdown" })).toBeNull();
  });

  it("a tap on free time names it, shows the equation a term a line, and offers Add something", async () => {
    const onAddSomething = jest.fn();
    await render(<TodayView {...props({ breakdown, onAddSomething })} />);
    await tap(10);
    const panel = within(screen.getByTestId("ribbon-breakdown"));
    expect(panel.getByText("Free · 09:00–10:00 · 1h")).toBeTruthy();
    for (const term of ["9h working", "1h 30m in meetings", "1h 20m buffer (15% of your working day)", "3h 20m planned", "2h 50m spare"]) expect(panel.getByText(term)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spare time breakdown" }).props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(panel.getByRole("button", { name: "Add something" }));
    expect(onAddSomething).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ribbon-breakdown")).toBeNull();
  });

  it("a tap on a meeting names it by its title and shows it on the timeline", async () => {
    const onShowMeeting = jest.fn();
    await render(<TodayView {...props({ breakdown, onShowMeeting })} />);
    await tap(45);
    const panel = within(screen.getByTestId("ribbon-breakdown"));
    expect(panel.getByText("Meeting · Design review · 10:00–11:00 · 1h")).toBeTruthy();
    await fireEvent.press(panel.getByRole("button", { name: "Show on timeline" }));
    expect(onShowMeeting).toHaveBeenCalledWith({ start: 600, end: 660 });
  });

  it("a block is named with nothing to do; the same thing tapped again closes the panel, another moves it", async () => {
    await render(<TodayView {...props({ breakdown })} />);
    await tap(220);
    const panel = () => within(screen.getByTestId("ribbon-breakdown"));
    expect(panel().getByText("Block · Call the bank · 16:00–16:35 · 35m")).toBeTruthy();
    expect(panel().queryByRole("button")).toBeNull();
    await tap(45);
    expect(panel().getByText("Meeting · Design review · 10:00–11:00 · 1h")).toBeTruthy();
    await tap(50);
    expect(screen.queryByTestId("ribbon-breakdown")).toBeNull();
  });

  it("a touch anywhere else closes it, and one on the panel itself does not", async () => {
    await render(<TodayView {...props({ breakdown })} />);
    await tap(10);
    // A real touch on the hero reaches the hero and then the screen around it; the test library calls only the
    // nearest handler, so each is given its turn here.
    const around = screen.getByTestId("today-screen");
    await fireEvent(screen.getByText("Free · 09:00–10:00 · 1h"), "touchStart");
    await fireEvent(around, "touchStart");
    expect(screen.getByTestId("ribbon-breakdown")).toBeTruthy();
    // The next touch does not start on the hero.
    await fireEvent(around, "touchStart");
    expect(screen.queryByTestId("ribbon-breakdown")).toBeNull();
  });
});

describe("<TodayView>: Plan my day, and what stays in sight", () => {
  const ritual = { shutdown: false, shutdownNote: null, plannedLabel: null, onPlan: jest.fn(), onShutdown: jest.fn() };
  const pane = () => <Text>the day’s hours</Text>;

  it("offers Plan my day on the line under the ritual row, beside the carried-over review", async () => {
    const onOpen = jest.fn();
    const onReview = jest.fn();
    await render(<TodayView {...props({ dayPane: pane, ritual: { ...ritual, plan: { label: "Plan my day", open: false, onOpen }, onReview } })} />);
    const line = within(screen.getByTestId("ritual-actions"));
    const plan = line.getByRole("button", { name: "Plan my day" });
    expect(plan.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(plan);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await fireEvent.press(line.getByRole("button", { name: "Review carried" }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("says Re-plan once the plan has blocks on a day that has started, and that its preview is open", async () => {
    await render(<TodayView {...props({ dayPane: pane, mode: "day", previewing: true, ritual: { ...ritual, plan: { label: "Re-plan the rest of today", open: true, onOpen: jest.fn() } } })} />);
    expect(screen.getByRole("button", { name: "Re-plan the rest of today" }).props.accessibilityState).toMatchObject({ expanded: true });
  });

  it("has no Plan my day on a day without working hours, or once the day has no ritual left", async () => {
    await render(<TodayView {...props({ ritual: { ...ritual, plan: { label: "Plan my day", open: false, onOpen: jest.fn() } } })} />);
    expect(screen.queryByRole("button", { name: "Plan my day" })).toBeNull();
    await render(<TodayView {...props({ dayPane: pane, ritual: null })} />);
    expect(screen.queryByRole("button", { name: "Plan my day" })).toBeNull();
  });

  it("keeps the hero card and the ritual row under the top edge while the lists pass beneath, the line under them scrolling away", async () => {
    await render(<TodayView {...props({ dayPane: pane, ritual: { ...ritual, plan: { label: "Plan my day", open: false, onOpen: jest.fn() } } })} />);
    const sticky = within(screen.getByTestId("sticky-part"));
    expect(sticky.getByLabelText("2h 50m spare")).toBeTruthy();
    expect(sticky.getByRole("link", { name: "Morning plan" })).toBeTruthy();
    expect(sticky.getByRole("radio", { name: "Day" })).toBeTruthy();
    expect(sticky.queryByRole("button", { name: "Plan my day" })).toBeNull();
    expect(sticky.queryByText("Call the bank")).toBeNull();
    // The second child of what scrolls is the one that stays.
    expect(screen.getByTestId("sticky-scroll").props.stickyHeaderIndices).toEqual([1]);
  });

  it("a day that was shut down has no hero to keep: its summary scrolls with the rest", async () => {
    await render(<TodayView {...props({ closed: { line: "Closed at 18:42 · 3 done · rated 4/5", highlights: null } })} />);
    expect(within(screen.getByTestId("sticky-part")).queryByText(/Closed at 18:42/)).toBeNull();
    expect(screen.getByText(/Closed at 18:42/)).toBeTruthy();
  });

  it("while the plan is previewed nothing stays over the hours, even on a tall phone: the hero scrolls away with them", async () => {
    const withAbove = (above: React.ReactNode) => (
      <>
        <Text>the day’s hours</Text>
        <Text>{above ? "hero above the hours" : "nothing above the hours"}</Text>
      </>
    );
    await render(<TodayView {...props({ dayPane: withAbove, mode: "day", previewing: true })} />);
    expect(screen.getByText("hero above the hours")).toBeTruthy();
    await render(<TodayView {...props({ dayPane: withAbove, mode: "day" })} />);
    expect(screen.getByText("nothing above the hours")).toBeTruthy();
  });
});
