// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsDialog } from "./shortcuts-dialog";

describe("<ShortcutsDialog> (the ? overlay)", () => {
  it("opens on its search field, grouped as SCREENS.md §24", () => {
    render(<ShortcutsDialog isMac onClose={() => {}} />);
    expect(screen.getByRole("searchbox", { name: "Search shortcuts" })).toHaveFocus();
    const list = screen.getByRole("region", { name: "All shortcuts" });
    expect(within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Global",
      "Navigation (G then a key)",
      "List and selection",
      "Editing the selected task",
      "Scheduling and snooze",
      "Timeline and calendar",
      "Rituals and the day",
    ]);
  });

  it("filters by action or key, and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(<ShortcutsDialog isMac onClose={() => {}} />);
    const field = screen.getByRole("searchbox", { name: "Search shortcuts" });
    await user.type(field, "evening");
    const list = screen.getByRole("region", { name: "All shortcuts" });
    expect(within(list).getAllByRole("term").map((t) => t.firstChild?.textContent)).toEqual(["Estimate", "This evening", "Evening shutdown"]);
    await user.clear(field);
    await user.type(field, "shift");
    expect(within(list).getByText("Deadline")).toBeInTheDocument();
    expect(within(list).queryByText("Do-date picker")).toBeNull();
    await user.clear(field);
    await user.type(field, "zebra");
    expect(within(list).getByRole("status")).toHaveTextContent("No shortcut matches “zebra”.");
  });

  it("Esc clears the search first, then closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutsDialog isMac onClose={onClose} />);
    const field = screen.getByRole("searchbox", { name: "Search shortcuts" });
    await user.type(field, "zoom");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});