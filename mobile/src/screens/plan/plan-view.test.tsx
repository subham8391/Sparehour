// The morning plan as the phone draws it: the three steps in the web's order with the web's words, what each control
// calls, and what stays in sight. The morning is plan-fixture.ts: made-up tasks, with every figure the shared rules' own.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { NOW_MIN, TODAY } from "../today/today-fixture";
import { ribbonShape } from "../today/ribbon-shape";
import { blockLead } from "./block-step";
import { planFixture } from "./plan-fixture";
import { MorningPlanView, type MorningPlanViewProps } from "./plan-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const fixture = planFixture();
const props = (more: Partial<MorningPlanViewProps> = {}, f = fixture): MorningPlanViewProps => ({
  capacity: f.day.capacity,
  ribbon: f.ribbon,
  blocks: f.day.blocks,
  groups: f.groups,
  onToday: f.onToday,
  fitsMin: f.fitsMin,
  tomorrowSpareMin: f.tomorrowSpareMin,
  eveningStartMin: 18 * 60,
  defaultEstimateMin: 35,
  asks: new Set(),
  today: TODAY,
  onPick: jest.fn(),
  onCarry: jest.fn(),
  onMoveToTomorrow: jest.fn(),
  onDone: jest.fn(),
  onSkip: jest.fn(),
  ...more,
});
const drawn = { includeHiddenElements: true };

describe("<MorningPlanView>: the frame", () => {
  it("opens on the day: the count, the title, the spare figure over the ribbon, one line of prose, and nothing to decide", async () => {
    await render(<MorningPlanView {...props()} />);
    expect(screen.getByText("MORNING PLAN · 1 OF 3")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Here’s your day" })).toBeTruthy();
    expect(screen.getByLabelText("2h 50m spare")).toBeTruthy();
    expect(screen.getByText("done by 16:35")).toBeTruthy();
    expect(screen.getByTestId("ribbon", drawn)).toBeTruthy();
    expect(screen.getByText("Working 09:00 to 18:00 with 2 meetings (1h 30m) and 3h 20m planned. 2 tasks carried over.")).toBeTruthy();
    expect(screen.getByText("Nothing to do here but read. The next step is the only decision of the morning.")).toBeTruthy();
    // The hero is Today's ribbon, only drawn: it has no breakdown to open here.
    expect(screen.queryByRole("button", { name: "Spare time breakdown" })).toBeNull();
  });

  it("a day without working hours says so in the one line", async () => {
    const off = planFixture({ state: "off" });
    await render(<MorningPlanView {...props({}, off)} />);
    expect(screen.getByText("No working hours today. 2 tasks carried over.")).toBeTruthy();
    expect(screen.queryByTestId("ribbon", drawn)).toBeNull();
  });

  it("Next and Back walk the steps, the strip goes to any of them, and Back is not there on the first", async () => {
    await render(<MorningPlanView {...props()} />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Step 1: Here’s your day" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("header", { name: "Pick today’s tasks" })).toBeTruthy();
    expect(screen.getByText("MORNING PLAN · 2 OF 3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next · Block time" }));
    expect(screen.getByRole("header", { name: "Block time" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("header", { name: "Pick today’s tasks" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Step 3: Block time" }));
    expect(screen.getByRole("header", { name: "Block time" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Step 1: Here’s your day" }));
    expect(screen.getByRole("header", { name: "Here’s your day" })).toBeTruthy();
  });

  it("Skip leaves from any step, and Done ends the last one", async () => {
    const onSkip = jest.fn();
    const onDone = jest.fn();
    await render(<MorningPlanView {...props({ onSkip, onDone, initialStep: "block" })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("<MorningPlanView>: picking today's tasks", () => {
  const pick = (more: Partial<MorningPlanViewProps> = {}, f = fixture) => props({ initialStep: "pick", ...more }, f);

  it("keeps the capacity summary under the top edge, read out in full, with the three groups and their counts under it", async () => {
    const onAsksShown = jest.fn();
    await render(<MorningPlanView {...pick({ onAsksShown })} />);
    const summary = within(screen.getByTestId("sticky-part"));
    expect(summary.getByText("5h 40m fits today · 2h 50m picked · 3 tasks")).toBeTruthy();
    expect(screen.getByTestId("plan-summary").props.accessibilityLabel).toBe("2h 50m to spare · 5h 40m fits today · 2h 50m picked · 3 tasks");
    expect(screen.getByText("Tick what you’ll work on. Everything else waits without turning red.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Carried over, 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Due this week, 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "From your projects, 8" })).toBeTruthy();
    expect(screen.getByText("Evening tasks aren’t counted here — they get their own 30m after 18:00.")).toBeTruthy();
    // The asks are on this step: it says so once it is on screen.
    expect(onAsksShown).toHaveBeenCalled();
  });

  it("a tick puts a task on today and an untick takes it off; the title ticks too", async () => {
    const onPick = jest.fn();
    const onToday = [...fixture.onToday, fixture.groups.dueThisWeek[0]];
    await render(<MorningPlanView {...pick({ onPick, onToday })} />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Pick Run 5k" }));
    expect(onPick).toHaveBeenLastCalledWith(fixture.groups.carried[0], true);
    const picked = screen.getByRole("checkbox", { name: "Pick File the tax return" });
    expect(picked.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(picked);
    expect(onPick).toHaveBeenLastCalledWith(fixture.groups.dueThisWeek[0], false);
    await fireEvent.press(screen.getByRole("button", { name: "Book the dentist" }));
    expect(onPick).toHaveBeenLastCalledWith(fixture.groups.fromProjects[1], true);
  });

  it("a row says where the task waits, its deadline (red only when missed), how often it was carried, and its estimate", async () => {
    await render(<MorningPlanView {...pick()} />);
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByLabelText("Deadline Fri 20 Nov")).toBeTruthy();
    expect(screen.getByLabelText(/^Deadline missed /)).toBeTruthy();
    expect(screen.getAllByText("Inbox").length).toBeGreaterThan(0);
    expect(screen.getByText("×4")).toBeTruthy();
    // Under "Carried over" the day chip would only repeat the heading.
    expect(screen.queryByText(/^Carried/)).toBeNull();
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.getAllByText("35m?").length).toBeGreaterThan(0);
  });

  it("the estimate opens the presets, and a preset is written at once", async () => {
    const onEstimate = jest.fn();
    await render(<MorningPlanView {...pick({ onEstimate })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Estimate for Run 5k" }));
    for (const preset of ["15m", "25m", "45m", "1h", "1h 30m", "2h"]) expect(screen.getByRole("button", { name: preset })).toBeTruthy();
    expect(screen.getByRole("button", { name: "30m" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "1h 30m" }));
    expect(onEstimate).toHaveBeenCalledWith("c1", 90);
  });

  it("a carried row keeps its four moves behind More actions", async () => {
    const onCarry = jest.fn();
    await render(<MorningPlanView {...pick({ onCarry })} />);
    for (const [label, to] of [["Today", "today"], ["Tomorrow", "tomorrow"], ["Someday", "someday"], ["Drop", "drop"]] as const) {
      await fireEvent.press(screen.getByRole("button", { name: "More actions for Take B12 Vit" }));
      await fireEvent.press(screen.getByRole("button", { name: label }));
      expect(onCarry).toHaveBeenLastCalledWith("c2", to);
    }
    expect(screen.queryByRole("button", { name: "More actions for File the tax return" })).toBeNull();
  });

  it("a carried row at the threshold asks in place of its moves, with the four answers in their order", async () => {
    const onCarry = jest.fn();
    const onBreakDown = jest.fn();
    await render(<MorningPlanView {...pick({ asks: fixture.asks, onCarry, onBreakDown })} />);
    expect(screen.getByText("Carried over 4 times — still want this?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More actions for Run 5k" })).toBeNull();
    const ask = within(screen.getByLabelText("Still want this?"));
    expect(ask.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    await fireEvent.press(ask.getByRole("button", { name: "Keep today" }));
    expect(onCarry).toHaveBeenLastCalledWith("c1", "today");
    await fireEvent.press(ask.getByRole("button", { name: "Break it down" }));
    expect(onBreakDown).toHaveBeenCalledWith("c1");
    await fireEvent.press(ask.getByRole("button", { name: "Drop" }));
    expect(onCarry).toHaveBeenLastCalledWith("c1", "drop");
  });

  it("From your projects shows six until More, a group folds under its header, and an empty one says so", async () => {
    await render(<MorningPlanView {...pick({ groups: { ...fixture.groups, dueThisWeek: [] } })} />);
    expect(screen.getByText("Nothing here.")).toBeTruthy();
    expect(screen.queryByText("Back up the laptop")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "More · 2" }));
    expect(screen.getByText("Back up the laptop")).toBeTruthy();
    expect(screen.getByText("Call the plumber")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Carried over, 2" }));
    expect(screen.queryByText("Run 5k")).toBeNull();
  });

  it("when more is picked than fits, the summary turns to the over words and the Easiest move sits under it", async () => {
    const over = planFixture({ state: "over" });
    const onMoveToTomorrow = jest.fn();
    await render(<MorningPlanView {...pick({ onMoveToTomorrow }, over)} />);
    expect(within(screen.getByTestId("sticky-part")).getByText("1h 25m over · 5h 40m fits today · 7h 05m picked · 3 tasks")).toBeTruthy();
    expect(screen.getByTestId("plan-summary").props.accessibilityLabel).toBe("1h 25m over · 5h 40m fits today · 7h 05m picked · 3 tasks 1h 25m more than fits. Move something to tomorrow, or keep it and let the day breathe less.");
    const coach = within(screen.getByTestId("plan-coach"));
    expect(coach.getByText(/Easiest move/)).toBeTruthy();
    expect(coach.getByText(/Review the budget · 5h/)).toBeTruthy();
    expect(coach.getByText("No deadline, and tomorrow has 6h spare. Moving it makes the day fit.")).toBeTruthy();
    // The coach scrolls with the groups; only the summary stays.
    expect(within(screen.getByTestId("sticky-part")).queryByText(/Easiest move/)).toBeNull();
    await fireEvent.press(coach.getByRole("button", { name: "Move to tomorrow" }));
    expect(onMoveToTomorrow).toHaveBeenCalledWith("t3");
    await fireEvent.press(coach.getByRole("button", { name: "Keep it anyway" }));
    expect(screen.queryByTestId("plan-coach")).toBeNull();
  });
});

describe("<MorningPlanView>: blocking time", () => {
  const dayPane = <Text>the day’s hours</Text>;
  const block = (more: Partial<MorningPlanViewProps> = {}, f = fixture) => props({ initialStep: "block", ...more }, f);

  it("lists the picked daytime tasks still without a time over the day's timeline, with the spare figure over them", async () => {
    const onPlace = jest.fn();
    await render(<MorningPlanView {...block({ blocking: { dayPane, placing: false, onPlace } })} />);
    expect(screen.getByText("Tap a task and then a time on your day.")).toBeTruthy();
    expect(screen.getByText(/2h 50m spare/)).toBeTruthy();
    expect(screen.getByText(/1 to block/)).toBeTruthy();
    // The report and the bank call already have their blocks; the evening's reading is not the working day's.
    const list = within(screen.getByLabelText("To block"));
    expect(list.getByText("Review the budget")).toBeTruthy();
    expect(list.queryByText("Call the bank")).toBeNull();
    expect(list.queryByText("Read two chapters")).toBeNull();
    expect(screen.getByText("the day’s hours")).toBeTruthy();
    await fireEvent.press(list.getByRole("button", { name: "Block Review the budget" }));
    await fireEvent.press(list.getByRole("button", { name: "Review the budget" }));
    expect(onPlace.mock.calls).toEqual([["t3"], ["t3"]]);
  });

  it("while a task waits for a time, the list steps aside and the hours have the step", async () => {
    await render(<MorningPlanView {...block({ blocking: { dayPane, placing: true, onPlace: jest.fn() } })} />);
    expect(screen.queryByTestId("block-step-top")).toBeNull();
    expect(screen.getByText("the day’s hours")).toBeTruthy();
  });

  it("says when everything picked has a time", async () => {
    const blocks = [...fixture.day.blocks, { taskId: "t3" }];
    await render(<MorningPlanView {...block({ blocks, blocking: { dayPane, placing: false, onPlace: jest.fn() } })} />);
    expect(screen.getByText(/everything picked has a time/)).toBeTruthy();
    expect(screen.queryByLabelText("To block")).toBeNull();
  });

  it("offers Plan my day, whose preview takes the button's place in the step", async () => {
    const onOpen = jest.fn();
    const blocking = { dayPane, placing: false, onPlace: jest.fn() };
    await render(<MorningPlanView {...block({ blocking, planMyDay: { open: false, onOpen, preview: <Text>the preview</Text> } })} />);
    expect(screen.getByText("Tap a task and then a time on your day. Plan my day proposes blocks for today’s tasks around your meetings, and nothing changes until you approve.")).toBeTruthy();
    expect(screen.queryByText("the preview")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Plan my day" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await render(<MorningPlanView {...block({ blocking, planMyDay: { open: true, onOpen, preview: <Text>the preview</Text> } })} />);
    expect(screen.getByText("the preview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Plan my day" })).toBeNull();
  });

  it("a preview opened from any step brings the flow to the last one", async () => {
    const planMyDay = { open: true, onOpen: jest.fn(), preview: <Text>the preview</Text> };
    await render(<MorningPlanView {...props({ planMyDay })} />);
    expect(screen.getByRole("header", { name: "Block time" })).toBeTruthy();
  });

  it("a day without working hours has no timeline, and says so", async () => {
    const off = planFixture({ state: "off" });
    await render(<MorningPlanView {...block({ ribbon: ribbonShape(off.day.capacity, NOW_MIN), blocking: { dayPane: null, placing: false, onPlace: jest.fn() } }, off)} />);
    expect(screen.getByText("No working hours today.")).toBeTruthy();
    expect(screen.queryByText("the day’s hours")).toBeNull();
  });
});

describe("blockLead", () => {
  it("names the tap on a phone, and adds Plan my day's sentence where it is offered", () => {
    expect(blockLead(true, false)).toBe("Tap a task and then a time on your day.");
    expect(blockLead(false, false)).toBe("Your day as it stands.");
    expect(blockLead(false, true)).toBe("Your day as it stands. Plan my day proposes blocks for today’s tasks around your meetings, and nothing changes until you approve.");
  });
});
