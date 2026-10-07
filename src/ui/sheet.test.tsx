// @vitest-environment jsdom
// The sheet owns the dialog's focus (SCREENS.md §1 rules 5 and 6). Seen in the
// walkthrough: Tab walked out of the palette into the page behind the scrim,
// and once focus had left the input, Escape no longer closed it.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <Sheet
          label="Example"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="Field" />
          <button type="button">First chip</button>
          <button type="button">Last chip</button>
        </Sheet>
      )}
    </div>
  );
}

describe("<Sheet>", () => {
  it("takes focus on open, keeps Tab inside, and Shift+Tab wraps backwards", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Example" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Field" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Last chip" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Field" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last chip" })).toHaveFocus();
  });

  it("Escape closes from any control inside, and focus goes back to the opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    screen.getByRole("button", { name: "First chip" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("when the focused control is taken out of the sheet, focus comes back to it and Escape still closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Placing() {
      const [left, setLeft] = useState(["Draft", "Send"]);
      return (
        <Sheet label="Not yet planned" onClose={onClose}>
          {left.map((t) => (
            <button key={t} type="button" onClick={() => setLeft((l) => l.filter((x) => x !== t))}>
              Place {t}
            </button>
          ))}
        </Sheet>
      );
    }
    render(<Placing />);
    await user.click(screen.getByRole("button", { name: "Place Draft" }));
    expect(screen.queryByRole("button", { name: "Place Draft" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Not yet planned" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus that lands behind the scrim is brought back in", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    screen.getByRole("button", { name: "Behind" }).focus();
    expect(screen.getByRole("textbox", { name: "Field" })).toHaveFocus();
  });
});
