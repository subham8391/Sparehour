// @vitest-environment jsdom
// "Add at 14:30" (DECISIONS.md, amendment 2026-11-21): the sheet "New block here" opens. It asks which task or what
// name, and how long, and writes nothing until Add.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AddableTask } from "@/features/blocking/use-placing";
import { AddAtSheet } from "./add-at-sheet";

const tasks: AddableTask[] = [
  { id: "t1", title: "Draft the proposal", minutes: 60, blocked: false },
  { id: "t2", title: "Call the bank", minutes: 35, blocked: false },
  { id: "t3", title: "Review the budget", minutes: 45, blocked: true },
];

function setup(over: { at?: number; tasks?: AddableTask[] } = {}) {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<AddAtSheet at={over.at ?? 14 * 60 + 30} tasks={over.tasks ?? tasks} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose, user, sheet: screen.getByRole("dialog", { name: /^Add at / }) };
}
/** A length chip, by its exact words ("1h", never "1h 30m"). */
const pressed = (name: string) => screen.getByRole("button", { name });

describe("AddAtSheet", () => {
  it("names the time, lists the day's tasks with their lengths, and adds nothing until something is chosen", async () => {
    const { onAdd, onClose, user, sheet } = setup();
    expect(sheet).toHaveAccessibleName("Add at 14:30");
    expect(within(sheet).getByText("14:30–15:00 · 30m")).toBeInTheDocument();
    const rows = within(sheet).getAllByRole("radio");
    expect(rows.map((r) => r.textContent)).toEqual(["Draft the proposal1h", "Call the bank35m", "Review the budgethas a block45m"]);
    expect(rows.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    const add = within(sheet).getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await user.click(add);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a task picked takes its own length, which joins the lengths when it is not one of them, and Add blocks it there", async () => {
    const { onAdd, onClose, user, sheet } = setup();
    await user.click(within(sheet).getByRole("radio", { name: /Call the bank/ }));
    expect(within(sheet).getByRole("radio", { name: /Call the bank/ })).toBeChecked();
    expect(within(sheet).getByText("14:30–15:05 · 35m")).toBeInTheDocument();
    expect(pressed("35m")).toHaveAttribute("aria-pressed", "true");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ taskId: "t2" }, 870, 905);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the length can be changed after a task is picked", async () => {
    const { onAdd, user, sheet } = setup();
    await user.click(within(sheet).getByRole("radio", { name: /Draft the proposal/ }));
    expect(pressed("1h")).toHaveAttribute("aria-pressed", "true");
    await user.click(pressed("1h 30m"));
    expect(within(sheet).getByText("14:30–16:00 · 1h 30m")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ taskId: "t1" }, 870, 960);
  });

  it("a name typed is a block of your own and lets go of the task picked; Enter adds it", async () => {
    const { onAdd, user, sheet } = setup();
    await user.click(within(sheet).getByRole("radio", { name: /Draft the proposal/ }));
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    await user.type(name, "  Lunch ");
    expect(within(sheet).getByRole("radio", { name: /Draft the proposal/ })).not.toBeChecked();
    // The length stays as it was left.
    expect(pressed("1h")).toHaveAttribute("aria-pressed", "true");
    await user.click(pressed("45m"));
    await user.type(name, "{Enter}");
    expect(onAdd).toHaveBeenCalledWith({ title: "Lunch" }, 870, 915);
  });

  it("a task picked after a name clears the name", async () => {
    const { onAdd, user, sheet } = setup();
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    await user.type(name, "Lunch");
    await user.click(within(sheet).getByRole("radio", { name: /Review the budget/ }));
    expect(name).toHaveValue("");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ taskId: "t3" }, 870, 915);
  });

  it("with no tasks it asks only for a name, and a name of spaces is not one", async () => {
    const { onAdd, user, sheet } = setup({ tasks: [] });
    expect(within(sheet).queryByRole("radiogroup")).not.toBeInTheDocument();
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    await user.type(name, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(sheet).getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(name, "Deep work{Enter}");
    expect(onAdd).toHaveBeenCalledWith({ title: "Deep work" }, 870, 900);
  });

  it("a block ends on the day it starts: late in the evening a long one stops at midnight", async () => {
    const { onAdd, user, sheet } = setup({ at: 23 * 60 + 30 });
    await user.click(within(sheet).getByRole("radio", { name: /Draft the proposal/ }));
    expect(within(sheet).getByText("23:30–00:00 · 30m")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ taskId: "t1" }, 1410, 1440);
  });

  it("Cancel and Escape close it and write nothing", async () => {
    const { onAdd, onClose, user, sheet } = setup();
    await user.click(within(sheet).getByRole("radio", { name: /Call the bank/ }));
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
