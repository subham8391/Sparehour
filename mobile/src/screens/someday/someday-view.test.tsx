// Someday as the phone draws it: the pinned group the rollover filed, the projects, the loose tasks, and what a row,
// its ⋯ (the shared row menu) and the Review walk each ask for.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { PreviewRows } from "~/screens/rows/preview-rows";
import type { RowsWiring } from "~/screens/rows/rows-frame";
import { SomedayReview, type PickDay, type SomedayReviewProps } from "./someday-sheets";
import { SomedayView, type SomedayViewProps } from "./someday-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const TODAY = localDate("2026-11-21");
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "someday", priority: 0, estimateMin: 30, carryCount: 0, projectId: null, doDate: null, ...more }) as unknown as Task;
const props = (over: Partial<SomedayViewProps> = {}): SomedayViewProps => ({
  today: TODAY,
  defaultEstimateMin: 35,
  empty: false,
  autoFiled: [task("s1", "Renew the passport", { projectId: "p1" as Task["projectId"] })],
  projects: [{ projectId: "p1", name: "Acme launch", area: "Work", tasks: [task("s2", "Write the case study", { projectId: "p1" as Task["projectId"], tags: ["writing"] })] }],
  loose: [task("s3", "Learn to bake bread")],
  projectNames: new Map([["p1", "Acme launch"]]),
  autoSomedayDays: 45,
  announced: 0,
  onReview: jest.fn(),
  onDismiss: jest.fn(),
  onBringAllBack: jest.fn(),
  onComplete: jest.fn(),
  onOpen: jest.fn(),
  onToday: jest.fn(),
  onBackToActive: jest.fn(),
  onDrop: jest.fn(),
  onBreakDown: jest.fn(),
  ...over,
});

/** The view inside its screen's frame, as someday.tsx draws it: a row's ⋯ is the frame's menu. */
const show = (p: SomedayViewProps, wiring: Partial<RowsWiring> = {}) =>
  render(
    <PreviewRows today={TODAY} wiring={wiring}>
      <SomedayView {...p} />
    </PreviewRows>,
  );

describe("<SomedayView>", () => {
  it("says it is allowed, and groups what is parked: filed automatically, by project with its area, then loose", async () => {
    await render(<SomedayView {...props()} />);
    expect(screen.getByRole("header", { name: "Things you’re not doing right now." })).toBeTruthy();
    expect(screen.getByText("That’s allowed.")).toBeTruthy();
    expect(screen.getByRole("header", { name: /MOVED HERE AUTOMATICALLY 1/ })).toBeTruthy();
    expect(screen.getByText("You hadn’t touched these in 45 days.")).toBeTruthy();
    expect(screen.getByRole("header", { name: /ACME LAUNCH 1 · Work/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: /NOT IN A PROJECT 1/ })).toBeTruthy();
  });

  it("a row names its project outside the project's own group, and its tags", async () => {
    await render(<SomedayView {...props()} />);
    // The filed task is in Acme launch and listed outside that group; the one under the group's label does not repeat it.
    expect(screen.getAllByText("Acme launch")).toHaveLength(1);
    expect(screen.getByText("@writing")).toBeTruthy();
  });

  it("the ring completes and the title opens", async () => {
    const p = props();
    await render(<SomedayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Learn to bake bread" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "s3" }));
    await fireEvent.press(screen.getByRole("button", { name: "Learn to bake bread" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "s3" }));
  });

  it("a row's ⋯ is the shared menu: Today, Back to active and Drop as its own, then the presets and Move to…, and no Someday", async () => {
    const p = props();
    const onMoveToDay = jest.fn();
    await show(p, { onMoveToDay });
    const s2 = expect.objectContaining({ id: "s2" });
    const more = () => fireEvent.press(screen.getByRole("button", { name: "More actions for Write the case study" }));
    for (const [name, called] of [
      ["Today", p.onToday],
      ["Back to active", p.onBackToActive],
      ["Drop", p.onDrop],
      ["Complete", p.onComplete],
    ] as const) {
      await more();
      await fireEvent.press(screen.getByRole("button", { name }));
      expect(called).toHaveBeenCalledWith(s2);
      // The sheet closes behind a choice.
      expect(screen.queryByRole("button", { name: "Back to active" })).toBeNull();
    }
    await more();
    for (const name of ["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week", "Move to project…", "Add a tag…", "Duplicate", "Copy link"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    // It is parked already.
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
    // The web's "Pick a date" is this menu's Move to…: the next seven days, then any other day.
    await fireEvent.press(screen.getByRole("button", { name: "Move to…" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tomorrow, Sun 22, 2h 30m spare" }));
    expect(onMoveToDay.mock.calls[0][0]).toBe("s2");
    expect(onMoveToDay.mock.calls[0][1].toString()).toBe("2026-11-22");
  });

  it("the pinned group offers Review and Bring them all back", async () => {
    const p = props();
    await render(<SomedayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(p.onReview).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Bring them all back" }));
    expect(p.onBringAllBack).toHaveBeenCalledTimes(1);
  });

  it("a new batch is announced once, with Review and a dismiss", async () => {
    const p = props({ announced: 2 });
    await render(<SomedayView {...p} />);
    expect(screen.getByText("2 tasks moved to Someday while you weren’t looking")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Review what moved to Someday" }));
    expect(p.onReview).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("says one task in the singular, and nothing when the batch has been told", async () => {
    const view = await render(<SomedayView {...props({ announced: 1 })} />);
    expect(screen.getByText("1 task moved to Someday while you weren’t looking")).toBeTruthy();
    await view.rerender(<SomedayView {...props()} />);
    expect(screen.queryByText(/while you weren’t looking/)).toBeNull();
  });

  it("with nothing parked it says so, calmly", async () => {
    await render(<SomedayView {...props({ empty: true, autoFiled: [], projects: [], loose: [] })} />);
    expect(screen.getByText("Nothing parked. That’s fine too.")).toBeTruthy();
    expect(screen.queryByRole("header", { name: /NOT IN A PROJECT/ })).toBeNull();
  });
});

const DAYS: PickDay[] = [
  { day: TODAY, name: "Today", date: "Sat 21" },
  { day: TODAY.add({ days: 1 }), name: "Tomorrow", date: "Sun 22" },
  { day: TODAY.add({ days: 2 }), name: "Mon 23" },
];
const review = (over: Partial<SomedayReviewProps> = {}): SomedayReviewProps => ({
  open: true,
  task: { id: "s1", title: "Renew the passport" },
  position: "1 of 2",
  line: "Acme launch · Last touched Tue 20 Oct",
  step: "ask",
  today: TODAY,
  days: DAYS,
  onKeep: jest.fn(),
  onToday: jest.fn(),
  onPickADate: jest.fn(),
  onPickDay: jest.fn(),
  onDrop: jest.fn(),
  onClose: jest.fn(),
  ...over,
});

describe("<SomedayReview>", () => {
  it("asks about one task at a time: where it is in the walk, when it was last touched, and four answers", async () => {
    const p = review();
    await render(<SomedayReview {...p} />);
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Renew the passport" })).toBeTruthy();
    expect(screen.getByText("Acme launch · Last touched Tue 20 Oct")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep in Someday" }));
    expect(p.onKeep).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(p.onToday).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Pick a date for Renew the passport" }));
    expect(p.onPickADate).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Drop" }));
    expect(p.onDrop).toHaveBeenCalledTimes(1);
  });

  it("its Pick a date step lists the days", async () => {
    const p = review({ step: "days" });
    await render(<SomedayReview {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Renew the passport to Tomorrow, Sun 22" }));
    expect(p.onPickDay).toHaveBeenCalledWith(DAYS[1].day);
  });

  it("ends on “That’s all of them.” with Done", async () => {
    const p = review({ task: null });
    await render(<SomedayReview {...p} />);
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.getByText("That’s all of them.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
