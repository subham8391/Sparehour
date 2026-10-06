// @vitest-environment jsdom
// Today's ⋯ (SCREENS.md §2.1), Trim today (PRODUCT_SPEC.md §9.4), the over sentence and the all-done state.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate, localTime } from "@/core/time";
import { capacityFixture, taskFixture } from "@/test/fixtures";
import { dayState } from "./day-state";
import { Ribbon, WELL_OVER_MIN, overSentence } from "./ribbon";
import TodayMenu, { type TodayMenuProps } from "./today-menu";
import { registerTodayHandler, requestToday, resetTodayRequests } from "./today-request";
import { todayAsText } from "./today-text";
import TrimToday, { FITS_CLOSE_MS, trimOrder, trimReadout } from "./trim-today";

const DAY = localDate("2026-10-06");

describe("dayState (SCREENS.md §2.7, ONBOARDING.md §4)", () => {
  const base = { closed: false, carried: 0, today: 0, evening: 0, done: 0 };
  it("all done once something was finished and nothing is left on today or this evening", () => {
    expect(dayState({ ...base, done: 3 })).toBe("all-done");
    expect(dayState({ ...base, done: 3, carried: 2 })).toBe("all-done");
    expect(dayState({ ...base, done: 3, evening: 1 })).toBe("planned");
    expect(dayState({ ...base, done: 3, today: 1 })).toBe("planned");
  });
  it("nothing planned and nothing finished is still the empty day; a closed day is neither", () => {
    expect(dayState(base)).toBe("empty");
    expect(dayState({ ...base, carried: 1 })).toBe("planned");
    expect(dayState({ ...base, closed: true, done: 2 })).toBe("planned");
  });
});

describe("todayAsText (Copy today as text)", () => {
  it("lists Carried over, Today and This evening with times and estimates", () => {
    const text = todayAsText({
      day: DAY,
      carried: [taskFixture("c", "Book dentist", { estimateMin: 10 })],
      today: [taskFixture("a", "Call the bank", { doTime: localTime("09:30"), estimateMin: null }), taskFixture("b", "Draft the proposal", { estimateMin: 120 })],
      evening: [taskFixture("e", "Call Mum", { estimateMin: 20, evening: true })],
      blockStart: (id) => (id === "b" ? 14 * 60 : null),
      defaultEstimateMin: 30,
    });
    expect(text).toBe(
      ["Tuesday 6 October", "", "Carried over", "- Book dentist · 10m", "", "Today", "- 09:30 Call the bank · 30m?", "- 14:00 Draft the proposal · 2h", "", "This evening", "- Call Mum · 20m"].join("\n"),
    );
  });
  it("says so when nothing is planned", () => {
    expect(todayAsText({ day: DAY, carried: [], today: [], evening: [], defaultEstimateMin: 30 })).toBe("Tuesday 6 October\n\nNothing planned.");
  });
});

describe("<TodayMenu>", () => {
  const props = (over: Partial<TodayMenuProps> = {}): TodayMenuProps => ({
    close: vi.fn(),
    sort: "manual",
    onSort: vi.fn(),
    showCompleted: false,
    onShowCompleted: vi.fn(),
    onClearSlate: vi.fn(),
    onTrim: vi.fn(),
    text: { day: DAY, carried: [], today: [taskFixture("a", "Call the bank")], evening: [], defaultEstimateMin: 30 },
    onNotice: vi.fn(),
    ...over,
  });

  it("offers Sort, Show completed, Clear the slate, Trim today, Copy today as text and Print, in that order", () => {
    const { container } = render(<TodayMenu {...props()} />);
    expect([...container.querySelectorAll("[role^=menuitem]")].map((b) => b.textContent)).toEqual(["SortManual", "Show completed", "Clear the slate…", "Trim today", "Copy today as text", "Print"]);
  });

  it("Sort opens the five sorts; choosing one saves it and closes the menu", async () => {
    const p = props({ sort: "estimate" });
    render(<TodayMenu {...p} />);
    await userEvent.click(screen.getByRole("menuitem", { name: /Sort/ }));
    expect(screen.getAllByRole("menuitemradio").map((b) => [b.textContent, b.getAttribute("aria-checked")])).toEqual([
      ["Manual", "false"],
      ["Time", "false"],
      ["Priority", "false"],
      ["Deadline", "false"],
      ["Estimate", "true"],
    ]);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Manual" }));
    expect(p.onSort).toHaveBeenCalledWith("manual");
    expect(p.close).toHaveBeenCalled();
  });

  it("Show completed toggles; Clear the slate and Trim today hand over", async () => {
    const p = props({ showCompleted: true });
    render(<TodayMenu {...p} />);
    expect(screen.getByRole("menuitemcheckbox", { name: "Show completed" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show completed" }));
    expect(p.onShowCompleted).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("menuitem", { name: /Clear the slate/ }));
    expect(p.onClearSlate).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "Trim today" }));
    expect(p.onTrim).toHaveBeenCalled();
  });

  it("Copy today as text puts the day on the clipboard and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const p = props();
    render(<TodayMenu {...p} />);
    await user.click(screen.getByRole("menuitem", { name: "Copy today as text" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("- Call the bank · 30m"));
    expect(p.onNotice).toHaveBeenCalledWith("Copied today as text");
  });

  it("Print closes the menu and opens the print dialog on light paper, putting the theme back after", async () => {
    vi.useFakeTimers();
    const print = vi.fn();
    window.print = print;
    document.documentElement.dataset.theme = "dark";
    const p = props();
    render(<TodayMenu {...p} />);
    act(() => screen.getByRole("menuitem", { name: "Print" }).click());
    expect(p.close).toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(60));
    expect(print).toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("light");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    vi.useRealTimers();
  });
});

describe("<TrimToday> (PRODUCT_SPEC.md §9.4)", () => {
  afterEach(() => vi.useRealTimers());
  const tasks = [taskFixture("s", "Small", { estimateMin: 15 }), taskFixture("b", "Big", { estimateMin: 120 }), taskFixture("u", "Unset", { estimateMin: null })];
  const handlers = () => ({ onTomorrow: vi.fn(), onSomeday: vi.fn(), onDrop: vi.fn(), onClose: vi.fn() });

  it("lists today's tasks largest first, each with Tomorrow, Someday and Drop", () => {
    expect(trimOrder(tasks, 30).map((t) => t.id)).toEqual(["b", "u", "s"]);
    render(<TrimToday tasks={tasks} overMin={40} defaultEstimateMin={30} {...handlers()} />);
    expect(screen.getByRole("dialog", { name: "Trim today" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Big2hTomorrowSomedayDrop", "Unset30m?TomorrowSomedayDrop", "Small15mTomorrowSomedayDrop"]);
    expect(screen.getByRole("status")).toHaveTextContent("40m more than fits");
  });

  it("each action is the row's own move", async () => {
    const h = handlers();
    render(<TrimToday tasks={tasks} overMin={40} defaultEstimateMin={30} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Big to tomorrow" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Unset to Someday" }));
    await userEvent.click(screen.getByRole("button", { name: "Drop Small" }));
    expect([h.onTomorrow.mock.calls[0][0], h.onSomeday.mock.calls[0][0], h.onDrop.mock.calls[0][0]]).toEqual(["b", "u", "s"]);
  });

  it("updates live, reads Now fits once the day fits, and closes itself", () => {
    vi.useFakeTimers();
    const h = handlers();
    const { rerender } = render(<TrimToday tasks={tasks} overMin={40} defaultEstimateMin={30} {...h} />);
    rerender(<TrimToday tasks={tasks.slice(1)} overMin={10} defaultEstimateMin={30} {...h} />);
    expect(screen.getByRole("status")).toHaveTextContent("10m more than fits");
    rerender(<TrimToday tasks={tasks.slice(2)} overMin={0} defaultEstimateMin={30} {...h} />);
    expect(screen.getByRole("status")).toHaveTextContent("Now fits");
    expect(h.onClose).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(FITS_CLOSE_MS));
    expect(h.onClose).toHaveBeenCalled();
    expect(trimReadout(95)).toBe("1h 35m more than fits");
  });

  it("opened on a day that already fits, it says so and stays", () => {
    vi.useFakeTimers();
    const h = handlers();
    render(<TrimToday tasks={tasks} overMin={0} defaultEstimateMin={30} {...h} />);
    expect(screen.getByRole("status")).toHaveTextContent("Today fits.");
    act(() => void vi.advanceTimersByTime(FITS_CLOSE_MS * 2));
    expect(h.onClose).not.toHaveBeenCalled();
  });
});

describe("the over sentence (ruling R3)", () => {
  const over = { ...capacityFixture, spareMin: -40, overflowMin: 40, projectedFinish: null };
  it("names the spill and one suggested move; tapping it opens Trim today", async () => {
    expect(overSentence({ min: 40, spill: "~40m spills past 18:00" }, "Write report")).toBe("~40m spills past 18:00 — move Write report to tomorrow");
    expect(overSentence({ min: 25, spill: null })).toBe("25m more than fits");
    const onTrim = vi.fn();
    render(<Ribbon c={over} onTrim={onTrim} suggestion="Write report" />);
    await userEvent.click(screen.getByRole("button", { name: "~40m spills past 18:00 — move Write report to tomorrow" }));
    expect(onTrim).toHaveBeenCalled();
    // Not well over: no inline offer.
    expect(screen.queryByText(/want help trimming/)).not.toBeInTheDocument();
  });

  it("well over (more than two hours) offers Trim today inline; nothing in the over states is red", async () => {
    const onTrim = vi.fn();
    const { container } = render(<Ribbon c={{ ...over, spareMin: -150, overflowMin: 150 }} onTrim={onTrim} />);
    expect(WELL_OVER_MIN).toBe(120);
    expect(screen.getByText(/2h 30m more than fits — want help trimming\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trim today" }));
    expect(onTrim).toHaveBeenCalled();
    expect(container.innerHTML).not.toMatch(/deadline/);
  });

  it("a day that fits has no over sentence", () => {
    render(<Ribbon c={capacityFixture} onTrim={vi.fn()} suggestion="Write report" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("today requests (the palette's Trim today, Sort by…, Show completed)", () => {
  afterEach(() => resetTodayRequests());
  it("Today takes a request while open; otherwise it waits for Today", () => {
    expect(requestToday({ kind: "trim" })).toBe(false);
    const handler = vi.fn();
    const off = registerTodayHandler(handler);
    expect(handler).toHaveBeenCalledWith({ kind: "trim" });
    expect(requestToday({ kind: "sort", sort: "time" })).toBe(true);
    expect(handler).toHaveBeenLastCalledWith({ kind: "sort", sort: "time" });
    off();
    expect(requestToday({ kind: "completed" })).toBe(false);
  });
});
