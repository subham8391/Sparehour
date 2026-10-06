// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CarryAsk, MenuOnly, MoveActions, RowAction, RowActionsLayoutProvider } from "./task-actions";

describe("<RowAction> in the phone's menu", () => {
  it("shows the whole word its name is, never an abbreviation of it (WCAG 2.5.3)", () => {
    render(
      <RowActionsLayoutProvider layout="menu">
        <RowAction label="Tomorrow" text="Tmr" icon="arrow-right" onClick={vi.fn()} />
      </RowActionsLayoutProvider>,
    );
    const item = screen.getByRole("menuitem", { name: "Tomorrow" });
    expect(item).toHaveTextContent(/^Tomorrow$/);
    expect(item).not.toHaveTextContent("Tmr");
  });

  it("keeps a short text that is part of its name, so the name still contains what is seen", () => {
    render(
      <RowActionsLayoutProvider layout="menu">
        <RowAction label="Block Draft the proposal" text="Block" onClick={vi.fn()} />
        <RowAction label="Move up" text={null} icon="arrow-up" onClick={vi.fn()} />
      </RowActionsLayoutProvider>,
    );
    expect(screen.getByRole("menuitem", { name: "Block Draft the proposal" })).toHaveTextContent(/^Block$/);
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveTextContent(/^Move up$/);
  });

  it("Today's row moves read Tomorrow in full, in the menu and in the row", () => {
    render(
      <>
        <RowActionsLayoutProvider layout="menu">
          <MoveActions onTomorrow={vi.fn()} />
        </RowActionsLayoutProvider>
        <RowActionsLayoutProvider layout="inline">
          <RowAction label="Tomorrow" icon="arrow-right" title="Tomorrow (Shift+T)" onClick={vi.fn()} />
        </RowActionsLayoutProvider>
      </>,
    );
    expect(screen.getByRole("menuitem", { name: "Tomorrow" })).toHaveTextContent(/^Tomorrow$/);
    expect(screen.getByRole("button", { name: "Tomorrow" })).toHaveTextContent(/^Tomorrow$/);
  });
});

describe("<MenuOnly>", () => {
  it("shows its actions in the phone's menu and nowhere else", () => {
    const { rerender } = render(
      <RowActionsLayoutProvider layout="menu">
        <MenuOnly>
          <RowAction label="Move to Budget" onClick={vi.fn()} />
        </MenuOnly>
      </RowActionsLayoutProvider>,
    );
    expect(screen.getByRole("menuitem", { name: "Move to Budget" })).toBeInTheDocument();
    rerender(
      <RowActionsLayoutProvider layout="inline">
        <MenuOnly>
          <RowAction label="Move to Budget" onClick={vi.fn()} />
        </MenuOnly>
      </RowActionsLayoutProvider>,
    );
    expect(screen.queryByRole("button", { name: "Move to Budget" })).not.toBeInTheDocument();
  });
});

describe("<CarryAsk> (SCREENS.md §2.3)", () => {
  it("offers exactly Keep today · Someday · Break it down · Drop, in that order, each its own answer", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const h = { onKeep: vi.fn(), onSomeday: vi.fn(), onBreakDown: vi.fn(), onDrop: vi.fn() };
    render(<CarryAsk count={3} {...h} />);
    const group = screen.getByRole("group", { name: "Still want this?" });
    expect(group).toHaveTextContent("Carried over 3 times — still want this?");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    for (const [name, fn] of [
      ["Keep today", h.onKeep],
      ["Someday", h.onSomeday],
      ["Break it down", h.onBreakDown],
      ["Drop", h.onDrop],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name }));
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
});
