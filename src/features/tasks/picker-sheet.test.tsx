// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PickerSheet, type PickerOption } from "./picker-sheet";

function Harness({ picks }: { picks: Record<string, () => void> }) {
  const [query, setQuery] = useState("");
  const options: PickerOption[] = ["Garden", "Garage", "Groceries"]
    .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
    .map((name) => ({ key: name, label: name, pick: picks[name] }));
  return <PickerSheet label="Move to a project" placeholder="Project" query={query} onQueryChange={setQuery} options={options} onClose={() => {}} />;
}

describe("<PickerSheet>", () => {
  it("a resting pointer never takes the highlight from the best match; one that moves does", async () => {
    const picks = { Garden: vi.fn(), Garage: vi.fn(), Groceries: vi.fn() };
    const user = userEvent.setup();
    const { unmount } = render(<Harness picks={picks} />);
    const input = screen.getByRole("combobox", { name: "Move to a project" });
    await user.type(input, "gar");
    const [best, second] = screen.getAllByRole("option");
    // Rows filtered under a resting pointer: enter and over events, and a move that goes nowhere.
    fireEvent.mouseMove(best, { clientX: 30, clientY: 80 });
    fireEvent.mouseEnter(second);
    fireEvent.mouseOver(second);
    fireEvent.mouseMove(second, { clientX: 30, clientY: 80 });
    expect(best).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(picks.Garden).toHaveBeenCalled();
    expect(picks.Garage).not.toHaveBeenCalled();
    unmount();

    render(<Harness picks={picks} />);
    await user.type(screen.getByRole("combobox", { name: "Move to a project" }), "gar");
    const moved = screen.getAllByRole("option")[1];
    fireEvent.mouseMove(moved, { clientX: 30, clientY: 80 });
    fireEvent.mouseMove(moved, { clientX: 34, clientY: 96 });
    expect(moved).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(picks.Garage).toHaveBeenCalled();
  });
});
