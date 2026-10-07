// @vitest-environment jsdom
// Step 1b (ONBOARDING.md §1b): the default week in one tap, the strip and the per-day rows, the spec's validation
// words, and the zone line.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HoursStep } from "./hours-step";
import type { Segment } from "./welcome-rules";

const nine: Segment = { start: "09:00", end: "18:00" };
const monFri = (): Segment[][] => [0, 1, 2, 3, 4, 5, 6].map((d) => (d < 5 ? [{ ...nine }] : []));

function setup(saved: Segment[][] = monFri(), zone = "Europe/London") {
  const onConfirm = vi.fn();
  render(<HoursStep saved={saved} zone={zone} onConfirm={onConfirm} />);
  return { onConfirm, user: userEvent.setup() };
}

describe("<HoursStep>", () => {
  it("asks the question and accepts Mon–Fri 09:00–18:00 in the detected zone in one tap", async () => {
    const { onConfirm, user } = setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("When do you work?");
    expect(screen.getByText("This is how we know what's left. You can change it any time.")).toBeInTheDocument();
    const days = within(screen.getByRole("group", { name: "Working days" })).getAllByRole("button");
    expect(days.map((d) => d.getAttribute("aria-pressed"))).toEqual(["true", "true", "true", "true", "true", "false", "false"]);
    expect(screen.getByLabelText("Start")).toHaveValue("09:00");
    expect(screen.getByLabelText("End")).toHaveValue("18:00");
    expect(screen.getByText(/Times are in/)).toHaveTextContent("Times are in Europe/London.");
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(onConfirm).toHaveBeenCalledWith(monFri(), "Europe/London");
  });

  it("blocks the save with no working day, and with an end before the start", async () => {
    const { onConfirm, user } = setup();
    for (const name of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) await user.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one working day.");
    expect(screen.getByRole("button", { name: "That’s right" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saturday" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "08:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("End time is before the start.");
    expect(screen.getByRole("button", { name: "That’s right" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "17:00" } });
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(onConfirm).toHaveBeenCalledWith([[], [], [], [], [], [{ start: "09:00", end: "17:00" }], []], "Europe/London");
  });

  it("notes a long day and still saves it", async () => {
    const { onConfirm, user } = setup();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "23:00" } });
    expect(screen.getByRole("status")).toHaveTextContent("That's a long day.");
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(onConfirm.mock.calls[0][0][0]).toEqual([{ start: "06:00", end: "23:00" }]);
  });

  it("Edit my hours opens a row per day, with a second stretch for a split day; overlaps are joined with a note", async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: "Edit my hours" }));
    expect(screen.queryByRole("button", { name: "Edit my hours" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Saturday is a working day" })).not.toBeChecked();
    await user.click(screen.getAllByRole("button", { name: /Add hours/ })[0]);
    const end2 = screen.getByLabelText("Monday end 2");
    expect(end2).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Monday start 2"), { target: { value: "17:00" } });
    fireEvent.change(end2, { target: { value: "20:00" } });
    fireEvent.blur(end2, { relatedTarget: document.body });
    expect(screen.getByText("Overlapping hours were joined: 09:00–20:00.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Friday is a working day" }));
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    const [week] = onConfirm.mock.calls[0];
    expect(week[0]).toEqual([{ start: "09:00", end: "20:00" }]);
    expect(week[4]).toEqual([]);
  });

  it("opens on the per-day rows when the saved week is more than the strip can say", () => {
    const saved = monFri();
    saved[2] = [
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ];
    setup(saved);
    expect(screen.getByLabelText("Wednesday start 2")).toHaveValue("13:30");
    expect(screen.queryByRole("group", { name: "Working days" })).not.toBeInTheDocument();
  });

  it("Change offers the zones, and the pick is what is saved", async () => {
    const { onConfirm, user } = setup(monFri(), "UTC");
    await user.click(screen.getByRole("button", { name: "Change" }));
    const select = screen.getByLabelText("Time zone");
    fireEvent.change(select, { target: { value: "Asia/Tokyo" } });
    await user.click(screen.getByRole("button", { name: "That’s right" }));
    expect(onConfirm.mock.calls[0][1]).toBe("Asia/Tokyo");
  });
});
