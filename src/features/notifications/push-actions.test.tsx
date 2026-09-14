// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PushActionSheet } from "./push-actions";

describe("<PushActionSheet>", () => {
  it("offers a kind's choices with the first one primary, and closes on Escape or the backdrop", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<PushActionSheet link={{ kind: "block_start", taskId: "t1", blockId: "b1", action: null }} onPick={onPick} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Your block is starting." })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["", "Start", "Snooze 15m", "Plan"]);
    await user.click(screen.getByRole("button", { name: "Snooze 15m" }));
    expect(onPick).toHaveBeenCalledWith("snooze");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("a deadline eve offers Today · Tomorrow · Plan", () => {
    render(<PushActionSheet link={{ kind: "deadline_eve", taskId: "t1", blockId: null, action: null }} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Due tomorrow." })).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent).slice(1)).toEqual(["Today", "Tomorrow", "Plan"]);
  });
});
