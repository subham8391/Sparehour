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
      <button type="button" onClick={() => record({ label: "Moved “Draft the proposal”", toast: false, announce: "Moved “Draft the proposal” to 14:30–15:15", undo: undoFn })}>
        drag
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

  it("announces through one live region that is on the page before the toast, and the toast itself stays quiet", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UndoProvider>
        <Harness undoFn={vi.fn().mockResolvedValue(undefined)} />
      </UndoProvider>,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("");
    await user.click(screen.getByRole("button", { name: "drop" }));
    expect(container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region).toHaveTextContent("Dropped “Draft the proposal”");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "off");
  });

  it("a drag's outcome is announced in words with no toast, and the same words again are read again", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UndoProvider>
        <Harness undoFn={vi.fn().mockResolvedValue(undefined)} />
      </UndoProvider>,
    );
    const region = container.querySelector('[aria-live="polite"]');
    await user.click(screen.getByRole("button", { name: "drag" }));
    expect(region?.textContent).toBe("Moved “Draft the proposal” to 14:30–15:15");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "drag" }));
    expect(region?.textContent).not.toBe("Moved “Draft the proposal” to 14:30–15:15");
    expect(region?.textContent?.trim()).toBe("Moved “Draft the proposal” to 14:30–15:15");
    // A silent entry without words says nothing new.
    await user.click(screen.getByRole("button", { name: "cmd-z" }));
    await user.click(screen.getByRole("button", { name: "silent" }));
    expect(region).toHaveTextContent("");
  });

  it("the toast stays ten seconds, then goes away on its own (PRODUCT_SPEC.md §7 rule 3)", async () => {
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
        vi.advanceTimersByTime(9500);
      });
      expect(screen.getByRole("status")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
