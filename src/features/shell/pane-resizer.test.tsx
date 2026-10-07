// @vitest-environment jsdom
// The context pane's edge (SCREENS.md §1 "width is draggable and remembered per view"): keyboard, drag and tap
// paths, the range, and the widths kept per view as one <style> that the theme bootstrap also writes before paint.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PANES_KEY, PANE_MAX, PANE_MIN } from "./panes";
import { PaneResizer, paneCss, readPaneWidths, setPaneWidth } from "./pane-resizer";

const rules = () => document.getElementById("pane-w")?.textContent ?? "";

afterEach(() => {
  localStorage.clear();
  document.getElementById("pane-w")?.remove();
});

function setup(view = "inbox", fallback = 384) {
  render(<PaneResizer view={view} label="Resize the task pane" fallback={fallback} className="md:block" />);
  return screen.getByRole("separator", { name: "Resize the task pane" });
}

describe("<PaneResizer>", () => {
  it("is a vertical separator with its range and the pane's width, at the default until one is chosen", () => {
    const edge = setup();
    expect(edge).toHaveAttribute("aria-orientation", "vertical");
    expect(edge).toHaveAttribute("aria-valuemin", String(PANE_MIN));
    expect(edge).toHaveAttribute("aria-valuemax", String(PANE_MAX));
    expect(edge).toHaveAttribute("aria-valuenow", "384");
    expect(edge).toHaveAttribute("tabindex", "0");
  });

  it("steps with the arrow keys (left widens the pane on the right), stops at its range, and Enter puts the default back", () => {
    const edge = setup();
    fireEvent.keyDown(edge, { key: "ArrowLeft" });
    expect(edge).toHaveAttribute("aria-valuenow", "400");
    fireEvent.keyDown(edge, { key: "ArrowRight", shiftKey: true });
    expect(edge).toHaveAttribute("aria-valuenow", "336");
    fireEvent.keyDown(edge, { key: "End" });
    expect(edge).toHaveAttribute("aria-valuenow", String(PANE_MAX));
    fireEvent.keyDown(edge, { key: "ArrowLeft" });
    expect(edge).toHaveAttribute("aria-valuenow", String(PANE_MAX));
    expect(readPaneWidths()).toEqual({ inbox: PANE_MAX });
    expect(rules()).toBe(`[data-view="inbox"]{--pane-w:${PANE_MAX}px}`);
    fireEvent.keyDown(edge, { key: "Home" });
    expect(edge).toHaveAttribute("aria-valuenow", String(PANE_MIN));
    fireEvent.keyDown(edge, { key: "Enter" });
    expect(edge).toHaveAttribute("aria-valuenow", "384");
    expect(readPaneWidths()).toEqual({});
    expect(rules()).toBe("");
  });

  it("takes the arrow keys for itself, so the list's own keys leave them alone", () => {
    const edge = setup();
    const e = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
    edge.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("remembers each view's width apart, and starts from it", () => {
    setPaneWidth("today", 450);
    const edge = setup("inbox");
    fireEvent.keyDown(edge, { key: "ArrowLeft" });
    expect(readPaneWidths()).toEqual({ today: 450, inbox: 400 });
    expect(rules()).toBe('[data-view="today"]{--pane-w:450px}[data-view="inbox"]{--pane-w:400px}');
    expect(JSON.parse(localStorage.getItem(PANES_KEY)!)).toEqual({ today: 450, inbox: 400 });
  });

  it("follows a mouse drag and saves where it lets go; a tap on a touch screen steps to the next width", () => {
    const edge = setup("project");
    edge.setPointerCapture = () => {};
    fireEvent.pointerDown(edge, { button: 0, clientX: 600, pointerType: "mouse" });
    fireEvent.pointerMove(edge, { clientX: 560 });
    expect(edge).toHaveAttribute("aria-valuenow", "424");
    // Live while dragging, saved only on letting go.
    expect(rules()).toBe('[data-view="project"]{--pane-w:424px}');
    expect(localStorage.getItem(PANES_KEY)).toBeNull();
    fireEvent.pointerUp(edge);
    expect(readPaneWidths()).toEqual({ project: 424 });

    fireEvent.pointerDown(edge, { button: 0, clientX: 600, pointerType: "touch" });
    fireEvent.pointerUp(edge);
    expect(readPaneWidths()).toEqual({ project: 480 });
    fireEvent.pointerDown(edge, { button: 0, clientX: 600, pointerType: "touch" });
    fireEvent.pointerUp(edge);
    fireEvent.pointerDown(edge, { button: 0, clientX: 600, pointerType: "touch" });
    fireEvent.pointerUp(edge);
    // Past the widest it comes round to the narrowest.
    expect(readPaneWidths()).toEqual({ project: PANE_MIN });
  });

  it("draws only views with plain names and widths inside the range", () => {
    expect(paneCss({ today: 9999, "x]{}": 400, inbox: 100 })).toBe('[data-view="today"]{--pane-w:560px}[data-view="inbox"]{--pane-w:320px}');
  });
});
