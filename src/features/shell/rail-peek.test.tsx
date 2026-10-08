// @vitest-environment jsdom
// The rail's labels on touch (SCREENS.md §1 "Narrow: a 56 px icon rail (labels on long-press)"): held half a second, a
// rail icon shows its name and count beside the rail, and letting go does not navigate; a tap still does; a mouse
// keeps the tooltip and never sees the label.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailPeek } from "./nav-drag-island";

vi.mock("@/features/tasks/use-repos", () => ({ useAreaRepo: () => ({}), useProjectOrderRepo: () => ({}) }));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({}) }));

function press(el: Element, type: string, pointerType = "touch", clientX = 10, clientY = 10) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  act(() => void el.dispatchEvent(e));
  return e;
}

/** Whether the label kept the click from navigating (the link's own listener runs after it, and stops jsdom navigating). */
function clickKept(link: Element): boolean {
  let kept = false;
  const own = (e: Event) => {
    kept = e.defaultPrevented;
    e.preventDefault();
  };
  link.addEventListener("click", own, { once: true });
  press(link, "click");
  return kept;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function setup() {
  render(
    <>
      <nav data-variant="rail">
        <a href="/today" aria-label="Today, 4">
          icon
        </a>
      </nav>
      <nav data-variant="full">
        <a href="/inbox">Inbox</a>
      </nav>
      <RailPeek />
    </>,
  );
  return screen.getByRole("link", { name: "Today, 4" });
}

describe("<RailPeek>", () => {
  it("a held finger shows the name with its count, and the click it lets go of does not navigate", () => {
    const link = setup();
    press(link, "pointerdown");
    act(() => void vi.advanceTimersByTime(499));
    expect(document.querySelector("[data-rail-peek]")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(document.querySelector("[data-rail-peek]")).toHaveTextContent("Today, 4");
    expect(document.querySelector("[data-rail-peek]")).toHaveAttribute("aria-hidden", "true");
    press(link, "pointerup");
    expect(clickKept(link)).toBe(true);
    expect(press(link, "contextmenu").defaultPrevented).toBe(true);
    // The label goes by itself a moment later.
    act(() => void vi.advanceTimersByTime(1500));
    expect(document.querySelector("[data-rail-peek]")).toBeNull();
  });

  it("a tap still navigates, and a finger that moves (scrolling the rail) shows nothing", () => {
    const link = setup();
    press(link, "pointerdown");
    act(() => void vi.advanceTimersByTime(200));
    press(link, "pointerup");
    expect(clickKept(link)).toBe(false);
    press(link, "pointerdown");
    press(link, "pointermove", "touch", 10, 40);
    act(() => void vi.advanceTimersByTime(600));
    expect(document.querySelector("[data-rail-peek]")).toBeNull();
  });

  it("a mouse keeps its tooltip: no label, and the full sidebar is left alone", () => {
    const link = setup();
    press(link, "pointerdown", "mouse");
    act(() => void vi.advanceTimersByTime(800));
    expect(document.querySelector("[data-rail-peek]")).toBeNull();
    press(screen.getByRole("link", { name: "Inbox" }), "pointerdown");
    act(() => void vi.advanceTimersByTime(800));
    expect(document.querySelector("[data-rail-peek]")).toBeNull();
  });
});
