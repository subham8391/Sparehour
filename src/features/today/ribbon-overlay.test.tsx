// @vitest-environment jsdom
// The ribbon's hands (SCREENS.md §2.2 "Interactions"): the breakdown in words, the segment names, and what a
// click, a tap and the keyboard do.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Capacity } from "@/core/capacity";
import { capacityFixture } from "@/test/fixtures";
import RibbonOverlay, { breakdownSentence, ribbonSegments, segmentAt, segmentLine, type RibbonOverlayProps } from "./ribbon-overlay";

// The canonical day (PRODUCT_SPEC.md §9.1): 09:00–18:00, a meeting 10:00–12:00, a block 13:00–15:20, the rest free.
const day: Capacity = {
  ...capacityFixture,
  workMin: 540,
  busyMin: 120,
  bufferMin: 80,
  committedMin: 140,
  unscheduledMin: 0,
  spareMin: 200,
  windows: [{ start: 540, end: 1080 }],
  busy: [{ start: 600, end: 720 }],
  blocks: [{ start: 780, end: 920 }],
  free: [
    { start: 540, end: 600 },
    { start: 720, end: 780 },
    { start: 920, end: 1080 },
  ],
};
const meetings = [{ start: 600, end: 720, title: "Design review" }];
const blocks = [{ id: "b1", taskId: null, title: "Write report", start: 780, end: 920, locked: false }];

describe("breakdownSentence (PRODUCT_SPEC.md §9.1)", () => {
  it("is the canonical equation, word for word", () => {
    expect(breakdownSentence(day, 15, true)).toBe("9h working − 2h in meetings − 1h 20m buffer (15% of your working day) − 2h 20m planned = 3h 20m spare");
  });

  it("leaves out the meetings without a calendar, says over when over, and drops the share when meetings cap the buffer", () => {
    expect(breakdownSentence({ ...day, busyMin: 0, spareMin: 320 }, 15, false)).toBe("9h working − 1h 20m buffer (15% of your working day) − 2h 20m planned = 5h 20m spare");
    expect(breakdownSentence({ ...day, unscheduledMin: 240, spareMin: -40 }, 15, true)).toMatch(/= 40m over$/);
    expect(breakdownSentence({ ...day, busyMin: 500, bufferMin: 40, committedMin: 0, spareMin: 0 }, 15, true)).toBe("9h working − 8h 20m in meetings − 40m buffer − 0m planned = 0m spare");
  });
});

describe("ribbon segments", () => {
  it("are the day in clock order, each named in words", () => {
    const segs = ribbonSegments(day, meetings, blocks);
    expect(segs.map(segmentLine)).toEqual([
      "Free · 09:00–10:00 · 1h",
      "Meeting · Design review · 10:00–12:00 · 2h",
      "Free · 12:00–13:00 · 1h",
      "Block · Write report · 13:00–15:20 · 2h 20m",
      "Free · 15:20–18:00 · 2h 40m",
    ]);
  });

  it("name merged meetings by their count, an untitled one Busy, and the hours between work windows", () => {
    const split: Capacity = { ...day, windows: [{ start: 540, end: 750 }, { start: 810, end: 1080 }], free: [{ start: 540, end: 600 }, { start: 720, end: 750 }, { start: 810, end: 1080 }], blocks: [] };
    const two = [
      { start: 600, end: 660, title: "Standup" },
      { start: 660, end: 720, title: "1:1" },
    ];
    const segs = ribbonSegments(split, two, []);
    expect(segs.find((s) => s.kind === "meeting")?.name).toBe("2 meetings");
    expect(ribbonSegments(split, [], []).find((s) => s.kind === "meeting")?.name).toBe("Busy");
    expect(segs.find((s) => s.kind === "off")).toMatchObject({ start: 750, end: 810, name: "Outside working hours" });
  });

  it("finds the segment under a minute, the last minute of the day included, and the overhang while the plan spills", () => {
    const segs = ribbonSegments(day, meetings, blocks);
    expect(segmentAt(segs, day, 630)?.kind).toBe("meeting");
    expect(segmentAt(segs, day, 1080)?.kind).toBe("free");
    const spill = segmentAt(segs, { ...day, overflowMin: 40 }, 1090);
    expect(spill && segmentLine(spill)).toBe("Over · 40m more than fits");
  });
});

/** jsdom's pointer events carry no pointerType, so one is set by hand. */
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerout", pointerType: string, clientX = 0) {
  // React hears a pointer leaving through pointerout towards something outside.
  const ev = new MouseEvent(type, { bubbles: true, clientX, relatedTarget: type === "pointerout" ? document.body : null });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  fireEvent(el, ev);
}

describe("<RibbonOverlay>", () => {
  // The drawn day is 540 px wide from x = 0, so a pixel is a minute past 09:00.
  function setup(over: Partial<RibbonOverlayProps> = {}) {
    const onAdd = vi.fn();
    const onMeeting = vi.fn();
    render(
      <div>
        <div aria-hidden="true">
          <div data-ribbon-day />
        </div>
        <RibbonOverlay c={day} connected bufferPct={15} meetings={meetings} blocks={blocks} onAdd={onAdd} onMeeting={onMeeting} {...over} />
      </div>,
    );
    const drawn = document.querySelector("[data-ribbon-day]") as HTMLElement;
    drawn.getBoundingClientRect = () => ({ left: 0, width: 540, top: 0, right: 540, bottom: 24, height: 24, x: 0, y: 0, toJSON: () => ({}) });
    return { onAdd, onMeeting, button: screen.getByRole("button", { name: "Spare time breakdown" }) };
  }

  it("is one real button whose description is the equation", () => {
    const { button } = setup();
    expect(button).toHaveAccessibleDescription("9h working − 2h in meetings − 1h 20m buffer (15% of your working day) − 2h 20m planned = 3h 20m spare");
    expect(button.closest("[aria-hidden]")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("with a mouse, a click on free time adds something for today and a click on a meeting shows it on the timeline", () => {
    const { button, onAdd, onMeeting } = setup();
    pointer(button, "pointerdown", "mouse");
    fireEvent.click(button, { clientX: 30, detail: 1 });
    expect(onAdd).toHaveBeenCalledTimes(1);
    pointer(button, "pointerdown", "mouse");
    fireEvent.click(button, { clientX: 100, detail: 1 });
    expect(onMeeting).toHaveBeenCalledWith({ start: 600, end: 720 });
  });

  it("a tap opens the breakdown for what was tapped, with its action as a button", async () => {
    const { button, onAdd } = setup();
    pointer(button, "pointerdown", "touch");
    fireEvent.click(button, { clientX: 400, detail: 1 });
    expect(onAdd).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Spare time breakdown" });
    expect(panel).toHaveTextContent("Free · 15:20–18:00 · 2h 40m");
    expect(panel).toHaveTextContent("1h 20m buffer (15% of your working day)");
    expect(panel).toHaveTextContent("3h 20m spare");
    await userEvent.click(screen.getByRole("button", { name: "Add something" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("from the keyboard: Enter opens it, the arrows step along the day, and a meeting can be shown; Escape closes", async () => {
    const { button, onMeeting } = setup();
    const user = userEvent.setup();
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("group")).toHaveTextContent("Free · 09:00–10:00 · 1h");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("group")).toHaveTextContent("Meeting · Design review · 10:00–12:00 · 2h");
    await user.click(screen.getByRole("button", { name: "Show on timeline" }));
    expect(onMeeting).toHaveBeenCalledWith({ start: 600, end: 720 });
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("group")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("hovering with a mouse names the segment and says what a click does", () => {
    const { button } = setup();
    pointer(button, "pointermove", "mouse", 300);
    const panel = screen.getByRole("group");
    expect(panel).toHaveTextContent("Block · Write report · 13:00–15:20 · 2h 20m");
    pointer(button, "pointermove", "mouse", 30);
    expect(panel).toHaveTextContent("Click to add something for today");
    pointer(button.parentElement as HTMLElement, "pointerout", "mouse");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
