// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UndoProvider, useUndo } from "./undo-provider";

function Harness({ undoFn }: { undoFn: () => Promise<void> }) {
  const { record, undo, canUndo } = useUndo();
  return (
    <div>
      <button type="button" onClick={() => record({ label: "Dropped “Draft the proposal”", toast: true, undo: undoFn })}>
        drop
      </button>
      <button type="button" onClick={() => record({ label: "Changed “Draft the proposal”", toast: false, undo: undoFn })}>
        silent
      </button>
      <button type="button" onClick={() => void undo()}>
        cmd-z
      </button>
      <p>can undo: {String(canUndo)}</p>
    </div>
  );
}

describe("<UndoProvider>", () => {
  it("shows a toast for regrettable writes and undoes from it", async () => {
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <Harness undoFn={undoFn} />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "drop" }));
    expect(screen.getByRole("status")).toHaveTextContent("Dropped “Draft the proposal”");
    expect(screen.getByText("can undo: true")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("can undo: false")).toBeInTheDocument();
  });

  it("silent entries have no toast but still answer ⌘Z, latest first", async () => {
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <Harness undoFn={undoFn} />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "silent" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cmd-z" }));
    expect(undoFn).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "cmd-z" }));
    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it("the toast goes away on its own", async () => {
    vi.useFakeTimers();
    try {
      const undoFn = vi.fn().mockResolvedValue(undefined);
      render(
        <UndoProvider>
          <Harness undoFn={undoFn} />
        </UndoProvider>,
      );
      act(() => {
        screen.getByRole("button", { name: "drop" }).click();
      });
      expect(screen.getByRole("status")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(6500);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
