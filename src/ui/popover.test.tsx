// @vitest-environment jsdom
// The ⋯ menu (SCREENS.md §10, DESIGN_SYSTEM.md §4a): focus on the first item
// when it opens, the arrows move, a letter jumps, Escape and a choice close it
// and hand focus back to the trigger; below `sm` it is a bottom sheet with a
// scrim and a grabber that axe finds clean.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { a11yViolations } from "@/test/axe";
import { MENU_ITEM, MenuButton, type MenuHandle } from "./popover";

function phone(matches: boolean) {
  const query = { matches, media: "", onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => query });
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

function Menu({ onPick = () => {}, portal = false, handle }: { onPick?: (word: string) => void; portal?: boolean; handle?: React.Ref<MenuHandle> }) {
  return (
    <MenuButton label="More actions" portal={portal} handle={handle}>
      {(close) =>
        ["Today", "Tomorrow", "Someday", "Drop"].map((word) => (
          <button
            key={word}
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => {
              onPick(word);
              close();
            }}
          >
            {word}
          </button>
        ))
      }
    </MenuButton>
  );
}

describe("MenuButton", () => {
  it("puts focus on the first item, moves with the arrows, Home and End, and jumps to a letter", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Today" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Tomorrow" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Drop" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Today" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Drop" })).toHaveFocus();
    await user.keyboard("s");
    expect(screen.getByRole("menuitem", { name: "Someday" })).toHaveFocus();
  });

  it("Escape closes it and focus goes back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("a choice closes it and focus goes back to the trigger; Enter chooses", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledWith("Tomorrow");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("Backspace and Delete stay in the menu: the app's Drop never sees them", async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    const onKey = (e: KeyboardEvent) => seen(e.key, e.defaultPrevented);
    window.addEventListener("keydown", onKey);
    try {
      render(<Menu />);
      await user.click(screen.getByRole("button", { name: "More actions" }));
      await user.keyboard("{Backspace}{Delete}");
      expect(seen).toHaveBeenCalledWith("Backspace", true);
      expect(seen).toHaveBeenCalledWith("Delete", true);
      expect(screen.getByRole("menuitem", { name: "Today" })).toHaveFocus();
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });

  it("keeps focus inside when its items are swapped while it is open (a lazy group arriving)", async () => {
    const user = userEvent.setup();
    function Swapping({ late }: { late: boolean }) {
      return (
        <MenuButton label="More actions">
          {() =>
            late ? (
              <div>
                <button type="button" role="menuitem" className={MENU_ITEM}>
                  Today
                </button>
                <button type="button" role="menuitem" className={MENU_ITEM}>
                  This evening
                </button>
              </div>
            ) : (
              <button type="button" role="menuitem" className={MENU_ITEM}>
                Today
              </button>
            )
          }
        </MenuButton>
      );
    }
    const { rerender } = render(<Swapping late={false} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const before = screen.getByRole("menuitem", { name: "Today" });
    expect(before).toHaveFocus();
    rerender(<Swapping late />);
    const after = screen.getByRole("menuitem", { name: "Today" });
    expect(after).not.toBe(before);
    await waitFor(() => expect(after).toHaveFocus());
  });

  it("a portalled menu whose items grow after it opened is placed again, inside the window (a lazy group arriving)", async () => {
    const user = userEvent.setup();
    phone(false);
    const resized: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resized.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let height = 80;
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("role") === "menu" ? height : 0;
      },
    });
    try {
      render(<Menu portal />);
      const trigger = screen.getByRole("button", { name: "More actions" });
      // Low in a 768 px window: 120 px of room below the trigger, 588 above.
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: 600, bottom: 636, left: 900, right: 936, width: 36, height: 36, x: 900, y: 600, toJSON: () => ({}) });
      await user.click(trigger);
      const menu = screen.getByRole("menu");
      // The fallback fits below the trigger.
      expect(menu.style.top).toBe("640px");
      // The lazy group arrives and the menu is 500 px tall: it goes above, all of it in the window.
      height = 500;
      act(() => resized.forEach((cb) => cb()));
      expect(menu.style.top).toBe("96px");
    } finally {
      if (offset) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offset);
      vi.unstubAllGlobals();
    }
  });

  it("opens from outside through its handle (the row's `.` key)", async () => {
    const handle = createRef<MenuHandle>();
    render(<Menu handle={handle} portal />);
    act(() => handle.current?.open());
    expect(screen.getByRole("menu", { name: "More actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Today" })).toHaveFocus();
    expect(handle.current?.trigger()).toBe(screen.getByRole("button", { name: "More actions" }));
  });

  it("from `sm` up a portalled menu is a fixed popover at the end of the document", async () => {
    const user = userEvent.setup();
    phone(false);
    const { container } = render(<Menu portal />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(container.contains(menu)).toBe(false);
    expect(menu.className).toContain("fixed");
    // A click inside is not a click outside.
    await user.click(screen.getByRole("menuitem", { name: "Someday" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("below `sm` it is a bottom sheet: scrim, grabber, the safe area; the scrim closes it and axe finds it clean", async () => {
    const user = userEvent.setup();
    phone(true);
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "More actions" });
    const frame = menu.parentElement?.parentElement;
    expect(frame?.className).toContain("fixed inset-0");
    expect(menu.parentElement?.className).toContain("rounded-t-sheet");
    expect(menu.parentElement?.className).toContain("safe-area-inset-bottom");
    expect(menu.parentElement?.querySelector("[aria-hidden='true']")).not.toBeNull(); // the grabber
    // 48 px rows on the phone.
    expect(screen.getByRole("menuitem", { name: "Today" }).className).toContain("max-sm:min-h-12");
    expect(await a11yViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
