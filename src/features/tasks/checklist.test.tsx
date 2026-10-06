// @vitest-environment jsdom
// The checklist's order (SCREENS.md §10): Move up / Move down in each step's
// ⋯ (the tap path for the drag), Alt+↑/↓ while typing, Enter on a step opens
// the next one right under it, and Tab never nests or leaves a step.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { compare } from "@/core/ordering";
import type { ChecklistItem, TaskId } from "@/core/types";
import { Checklist, keyForStep } from "./checklist";

const step = (id: string, title: string, sortKey: string): ChecklistItem => ({ id, taskId: "t1" as TaskId, title, done: false, sortKey });
const items = [step("c1", "Outline", "a0"), step("c2", "Draft", "a1"), step("c3", "Send", "a2")];

function setup() {
  const onReorder = vi.fn<(id: string, key: string) => void>();
  const onAdd = vi.fn<(title: string, key?: string) => void>();
  const onRename = vi.fn();
  render(<Checklist items={items} onReorder={onReorder} onAdd={onAdd} onRename={onRename} onToggle={vi.fn()} onRemove={vi.fn()} />);
  return { onReorder, onAdd, onRename, user: userEvent.setup() };
}

/** Where the moved step would sit, given the key it was handed. */
const orderAfter = (id: string, key: string) =>
  items
    .map((x) => (x.id === id ? { ...x, sortKey: key } : x))
    .sort((a, b) => compare({ id: a.id, sortKey: a.sortKey }, { id: b.id, sortKey: b.sortKey }))
    .map((x) => x.title);

describe("<Checklist> order", () => {
  it("keyForStep moves one place, and not past either end", () => {
    expect(keyForStep(items, "c1", -1)).toBeNull();
    expect(keyForStep(items, "c3", 1)).toBeNull();
    expect(orderAfter("c3", keyForStep(items, "c3", -1)!)).toEqual(["Outline", "Send", "Draft"]);
    expect(orderAfter("c1", keyForStep(items, "c1", 1)!)).toEqual(["Draft", "Outline", "Send"]);
  });

  it("each step's menu moves it up or down, and offers no move past an end", async () => {
    const { user, onReorder } = setup();
    await user.click(screen.getByRole("button", { name: "Step actions: Outline" }));
    expect(screen.queryByRole("menuitem", { name: "Move up" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(orderAfter("c1", onReorder.mock.calls[0][1])).toEqual(["Draft", "Outline", "Send"]);

    await user.click(screen.getByRole("button", { name: "Step actions: Send" }));
    expect(screen.queryByRole("menuitem", { name: "Move down" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(onReorder.mock.calls[1][0]).toBe("c3");
    expect(orderAfter("c3", onReorder.mock.calls[1][1])).toEqual(["Outline", "Send", "Draft"]);
  });

  it("Alt+↑ moves the step being typed in", async () => {
    const { user, onReorder } = setup();
    await user.click(screen.getByRole("textbox", { name: "Step: Draft" }));
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(onReorder.mock.calls[0][0]).toBe("c2");
    expect(orderAfter("c2", onReorder.mock.calls[0][1])).toEqual(["Draft", "Outline", "Send"]);
  });

  it("Enter on a step opens a new one right under it, and Enter there adds it and opens the next", async () => {
    const { user, onAdd } = setup();
    await user.click(screen.getByRole("textbox", { name: "Step: Outline" }));
    await user.keyboard("{Enter}");
    const fresh = screen.getByRole("textbox", { name: "New step" });
    expect(fresh).toHaveFocus();
    // It sits between Outline and Draft.
    const boxes = screen.getAllByRole("textbox").map((el) => el.getAttribute("aria-label"));
    expect(boxes.slice(0, 3)).toEqual(["Step: Outline", "New step", "Step: Draft"]);
    await user.keyboard("Research{Enter}");
    const [title, key] = onAdd.mock.calls[0];
    expect(title).toBe("Research");
    expect(key! > "a0" && key! < "a1").toBe(true);
    // Another opens under the one just added, still before Draft.
    expect(screen.getByRole("textbox", { name: "New step" })).toHaveFocus();
    await user.keyboard("Read{Enter}");
    const second = onAdd.mock.calls[1][1]!;
    expect(second > key! && second < "a1").toBe(true);
    // An empty new step that loses focus simply goes away.
    await user.click(screen.getByRole("textbox", { name: "Add a step" }));
    expect(screen.queryByRole("textbox", { name: "New step" })).toBeNull();
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("Tab and Shift+Tab stay in the step; Escape leaves it for its menu", async () => {
    const { user } = setup();
    const draft = screen.getByRole("textbox", { name: "Step: Draft" });
    await user.click(draft);
    await user.tab();
    expect(draft).toHaveFocus();
    await user.tab({ shift: true });
    expect(draft).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Step actions: Draft" })).toHaveFocus();
  });
});
