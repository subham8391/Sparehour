// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localTime } from "@/core/time";
import { RitualRow, type RitualRowProps } from "./ritual-row";

function setup(over: Partial<RitualRowProps> = {}) {
  const props: RitualRowProps = {
    closed: false,
    hasDay: true,
    shutdownTime: false,
    finish: null,
    dayOver: false,
    plannedAt: null,
    plan: { label: "Plan my day", open: false, onOpen: vi.fn() },
    onReview: vi.fn(),
    view: "list",
    onView: vi.fn(),
    ...over,
  };
  render(<RitualRow {...props} />);
  return props;
}

describe("<RitualRow>", () => {
  it("keeps List | Day on the ritual's own line, with Plan my day and the review on a line beneath (412 px fits)", () => {
    setup();
    const line = screen.getByTestId("ritual-line");
    // Only the ritual, its status and the control share the line; the two other actions, which pushed the control
    // under the row at 412 px, have a line of their own.
    expect(within(line).getByRole("link", { name: "Morning plan" })).toHaveAttribute("href", "/plan");
    expect(within(line).getByText("Not planned yet")).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "List" })).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Day" })).toBeInTheDocument();
    expect(within(line).queryByRole("button", { name: "Plan my day" })).not.toBeInTheDocument();
    const actions = screen.getByTestId("ritual-actions");
    expect(within(actions).getByRole("button", { name: "Plan my day" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Review carried" })).toBeInTheDocument();
    // Every target stays 44 px on the phone.
    for (const target of [...within(line).getAllByRole("button"), ...within(actions).getAllByRole("button"), within(line).getByRole("link")]) {
      expect(target.className).toMatch(/\bh-11\b|\bh-full\b/);
    }
  });

  it("from the projected finish the line offers the shutdown with it, still beside the control", () => {
    setup({ shutdownTime: true, finish: localTime("16:25"), onReview: null, plan: { label: "Re-plan the rest of today", open: false, onOpen: vi.fn() } });
    const line = screen.getByTestId("ritual-line");
    expect(within(line).getByRole("link", { name: "Shutdown" })).toHaveAttribute("href", "/shutdown");
    expect(within(line).getByText("done by 16:25")).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Day" })).toBeInTheDocument();
    expect(within(screen.getByTestId("ritual-actions")).getByRole("button", { name: "Re-plan the rest of today" })).toBeInTheDocument();
  });

  it("switches the view and opens the plan", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(p.onView).toHaveBeenCalledWith("day");
    await user.click(screen.getByRole("button", { name: "Plan my day" }));
    expect(p.plan!.onOpen).toHaveBeenCalled();
  });

  it("once the day is closed only the control is left, and no line of actions", () => {
    setup({ closed: true });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ritual-actions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
  });
});
