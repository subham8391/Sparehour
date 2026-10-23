// @vitest-environment jsdom
// The time field and its wheel (DECISIONS.md, amendment 2026-10-23): typed with a keyboard (a whole time saves at
// once, a loose one when the box is left, ↑/↓ step it), the wheel from the clock or Alt+↓ with keys, chips and typed
// digits, "No time" only where a time may be cleared, and a tap that opens the wheel on a touch screen.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTime, TimeField } from "./time-field";

function Field({ initial = "09:00", clearable = false, onChange = vi.fn() }: { initial?: string; clearable?: boolean; onChange?: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <TimeField
      aria-label="Monday start"
      value={v}
      clearable={clearable}
      onChange={(next) => {
        setV(next);
        onChange(next);
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTime", () => {
  it("reads whole and loose times, and nothing else", () => {
    expect(["14:30", "930", "0930", "9:30", "9.30", "21", "9"].map(parseTime)).toEqual(["14:30", "09:30", "09:30", "09:30", "09:30", "21:00", "09:00"]);
    expect(["24:00", "9:60", "abc", "1:2", ""].map(parseTime)).toEqual([null, null, null, null, null]);
  });
});

describe("<TimeField> with a keyboard", () => {
  it("a whole time saves as it is typed; a loose one when the box is left; nonsense goes back", async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Monday start" });
    fireEvent.change(box, { target: { value: "10:15" } });
    expect(onChange).toHaveBeenLastCalledWith("10:15");
    fireEvent.change(box, { target: { value: "730" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.blur(box);
    expect(onChange).toHaveBeenLastCalledWith("07:30");
    expect(box).toHaveValue("07:30");
    fireEvent.change(box, { target: { value: "lunch" } });
    fireEvent.blur(box);
    expect(box).toHaveValue("07:30");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("↑ and ↓ move it by five minutes", async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Monday start" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("09:05");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("08:55");
  });

  it("an emptied box clears only where a time may be cleared", () => {
    const onChange = vi.fn();
    const { unmount } = render(<Field onChange={onChange} />);
    let box = screen.getByRole("textbox", { name: "Monday start" });
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(box).toHaveValue("09:00");
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    render(<Field clearable onChange={onChange} />);
    box = screen.getByRole("textbox", { name: "Monday start" });
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});

describe("the wheel", () => {
  it("opens from the clock on the time saved, steps with the keys and the chips, and sets it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Field onChange={onChange} />);
    await user.click(screen.getByTitle("Choose on a wheel"));
    const sheet = await screen.findByRole("dialog", { name: "Choose Monday start" });
    const hours = within(sheet).getByRole("spinbutton", { name: "Hours" });
    expect(hours).toHaveAttribute("aria-valuetext", "09");
    fireEvent.keyDown(hours, { key: "ArrowDown" });
    expect(hours).toHaveAttribute("aria-valuetext", "10");
    fireEvent.keyDown(within(sheet).getByRole("spinbutton", { name: "Minutes" }), { key: "ArrowDown" });
    await user.click(within(sheet).getByRole("button", { name: "+15m" }));
    await user.click(within(sheet).getByRole("button", { name: "Set 10:20" }));
    expect(onChange).toHaveBeenLastCalledWith("10:20");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Monday start" })).toHaveValue("10:20");
  });

  it("typed digits set the time, Enter sets it, and Alt+↓ opens it from the box", async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Monday start" }), { key: "ArrowDown", altKey: true });
    const sheet = await screen.findByRole("dialog", { name: "Choose Monday start" });
    for (const k of ["1", "4", "3", "0"]) fireEvent.keyDown(sheet, { key: k });
    expect(within(sheet).getByRole("button", { name: "Set 14:30" })).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("14:30");
  });

  it("a tap on a row picks it; Cancel changes nothing; No time shows only where a time may be cleared", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Field initial="09:56" onChange={onChange} />);
    await user.click(screen.getByTitle("Choose on a wheel"));
    let sheet = await screen.findByRole("dialog");
    // The off-step minute it opened on stays a row of its own.
    expect(within(within(sheet).getByRole("spinbutton", { name: "Minutes" })).getByText("56")).toBeInTheDocument();
    await user.click(within(within(sheet).getByRole("spinbutton", { name: "Hours" })).getByText("07"));
    expect(within(sheet).getByRole("button", { name: "Set 07:56" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "No time" })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    render(<Field clearable onChange={onChange} />);
    await user.click(screen.getByTitle("Choose on a wheel"));
    sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "No time" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("on a touch screen a tap opens the wheel and the box never takes the keyboard", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("coarse"), addEventListener() {}, removeEventListener() {} }));
    render(<Field />);
    const box = screen.getByRole("textbox", { name: "Monday start" });
    expect(box).toHaveAttribute("readonly");
    expect(box).toHaveAttribute("inputmode", "none");
    await act(async () => fireEvent.click(box));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Choose Monday start" })).toBeInTheDocument());
  });
});
