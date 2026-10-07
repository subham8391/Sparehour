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
