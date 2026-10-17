// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar, type NavArea } from "./sidebar";
import { syncChipModel } from "./sync-chip";
import { TabBar } from "./tab-bar";

const sync = syncChipModel({
  online: true,
  connected: true,
  uploading: false,
  downloading: false,
  hasError: false,
  lastSyncedAt: new Date("2026-09-14T08:59:50Z"),
  pending: 0,
  now: new Date("2026-09-14T09:00:00Z"),
});
const areas: NavArea[] = [
  { id: "a1", name: "Work", projects: [{ id: "p1", name: "Acme" }, { id: "p2", name: "Website" }] },
  { id: "a2", name: "Personal", projects: [] },
];

describe("<Sidebar>", () => {
  it("lists the fixed views in order, then areas with their projects, then sync and settings", () => {
    render(<Sidebar pathname="/today" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link").map((l) => l.getAttribute("aria-label") ?? l.textContent?.trim());
    expect(links).toEqual(["Sparehour — Today", "Inbox3", "Today4", "Upcoming", "Calendar", "Someday", "Logbook", "Add area", "Work", "Acme", "Website", "Personal", "Settings"]);
  });

  it("offers a new area beside the Areas heading, even before there is one", () => {
    render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={[]} sync={sync} />);
    const areasSection = screen.getByRole("region", { name: "Areas" });
    expect(within(areasSection).getByRole("link", { name: "Add area" })).toHaveAttribute("href", "/browse?add=area");
  });

  it("the Projects group for projects without an area is a heading, not a link to a page that isn't there", () => {
    const loose: NavArea[] = [...areas, { id: "__loose", name: "Projects", projects: [{ id: "p9", name: "Side quest" }], loose: true }];
    render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={loose} sync={sync} />);
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Side quest" })).toHaveAttribute("href", "/project/p9");
    expect(screen.getByRole("button", { name: "Collapse Projects" })).toBeInTheDocument();
    expect(document.querySelector('a[href="/area/__loose"]')).toBeNull();
  });

  it("marks the current view and only that view", () => {
    render(<Sidebar pathname="/project/p2" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((l) => l.textContent?.trim())).toEqual(["Website"]);
  });

  it("shows counts only above zero, and only on Inbox and Today", () => {
    render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 12 }} areas={[]} sync={sync} />);
    expect(screen.getByRole("link", { name: /^Inbox$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Today/ })).toHaveTextContent("Today12");
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveTextContent(/^Upcoming$/);
  });

  it("collapses an area's projects without losing the area", async () => {
    const user = userEvent.setup();
    render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} />);
    expect(screen.getByRole("link", { name: "Acme" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse Work" }));
    expect(screen.queryByRole("link", { name: "Acme" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Work" })).toHaveAttribute("aria-expanded", "false");
  });

  it("the rail keeps every view reachable by name, with counts spoken", () => {
    render(<Sidebar rail pathname="/inbox" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveAttribute("data-variant", "rail");
    expect(within(nav).getByRole("link", { name: "Inbox, 3" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Today, 4" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Acme" })).not.toBeInTheDocument();
    // No room for the areas tree in the rail: Browse is how areas and projects are reached there.
    expect(within(nav).getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/browse");
    expect(within(nav).getByRole("button", { name: "Synced 10s ago" })).toBeInTheDocument();
  });

  it("Collapse sidebar folds the full sidebar to the rail and Expand sidebar opens it again, focus following (Cmd+\\)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Sidebar rail pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} />
        <Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} />
      </>,
    );
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    // Each nav carries one: the rail's only from the medium band, where it stands in for the folded sidebar.
    expect(collapse.closest("nav")).toHaveAttribute("data-variant", "full");
    expect(expand.closest("nav")).toHaveAttribute("data-variant", "rail");
    expect(expand).toHaveClass("max-md:hidden");
    expect(expand).not.toHaveClass("hidden");
    await user.click(collapse);
    expect(document.documentElement.dataset.sidebar).toBe("rail");
    expect(localStorage.getItem("sparehour.sidebar")).toBe("rail");
    expect(expand).toHaveFocus();
    await user.click(expand);
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(collapse).toHaveFocus();
  });

  it("on the rail the mark is Expand sidebar from the medium band, turning into the sidebar glyph on hover or focus; below it the mark links to Today", () => {
    render(<Sidebar rail pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    // One way to open the sidebar again, at the top: nothing in the footer any more.
    const expand = within(nav).getAllByRole("button", { name: "Expand sidebar" });
    expect(expand).toHaveLength(1);
    expect(nav.firstElementChild).toContainElement(expand[0]);
    expect(expand[0]).toHaveClass("max-md:hidden");
    // It shows the mark, and swaps it for the glyph under a pointer or keyboard focus.
    const [mark, glyph] = Array.from(expand[0].querySelectorAll("svg"));
    expect(mark).toHaveClass("group-hover/expand:hidden", "group-focus-visible/expand:hidden");
    expect(glyph).toHaveClass("hidden", "group-hover/expand:block", "group-focus-visible/expand:block");
    // Below the medium band the rail cannot open, so the mark stays the link to Today there.
    expect(within(nav).getByRole("link", { name: "Sparehour — Today" })).toHaveClass("md:hidden");
  });

  it("the rail's names carry the count and a tooltip, Settings included", () => {
    render(<Sidebar rail pathname="/inbox" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    expect(screen.getByRole("link", { name: "Today, 4" })).toHaveAttribute("title", "Today");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("title", "Settings");
  });

  it("carries the pointer's way to the palette, with its ⌘K hint, and the ? overlay beside Settings (SCREENS.md §0, §1)", async () => {
    const user = userEvent.setup();
    const onPalette = vi.fn();
    const onShortcuts = vi.fn();
    const { unmount } = render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} isMac onPalette={onPalette} onShortcuts={onShortcuts} />);
    const search = screen.getByRole("button", { name: "Search and commands" });
    expect(search).toHaveTextContent("Search⌘K");
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K");
    await user.click(search);
    expect(onPalette).toHaveBeenCalledTimes(1);
    const help = screen.getByRole("button", { name: "Keyboard shortcuts" });
    // Beside Settings, in the footer; hidden on a touch device until a hardware keyboard types (`data-keys-only`).
    expect(help.parentElement).toContainElement(screen.getByRole("link", { name: "Settings" }));
    expect(help).toHaveAttribute("data-keys-only");
    await user.click(help);
    expect(onShortcuts).toHaveBeenCalledTimes(1);
    unmount();

    // The rail: an icon with the hint in its tooltip, the ? under Settings; every target 44 px on touch.
    render(<Sidebar rail pathname="/today" counts={{ inbox: 0, today: 0 }} areas={areas} sync={sync} isMac={false} onPalette={onPalette} onShortcuts={onShortcuts} />);
    const railSearch = screen.getByRole("button", { name: "Search and commands" });
    expect(railSearch).toHaveAttribute("title", "Search and commands (Ctrl+K)");
    expect(railSearch.className).toMatch(/\btouch:size-11\b/);
    await user.click(railSearch);
    expect(onPalette).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" }).className).toMatch(/\btouch:size-11\b|\btouch:h-11\b/);
    // Browse (where Search's field lives on narrow screens) stays on the rail.
    expect(screen.getByRole("link", { name: "Browse" })).toBeInTheDocument();
  });

  it("without the palette wired (a bare sidebar) draws no search control", () => {
    render(<Sidebar pathname="/today" counts={{ inbox: 0, today: 0 }} areas={[]} sync={sync} />);
    expect(screen.queryByRole("button", { name: "Search and commands" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keyboard shortcuts" })).toBeNull();
  });
});

describe("<TabBar>", () => {
  it("has the four phone tabs with Browse owning the phone-sidebar routes", () => {
    render(<TabBar pathname="/someday" counts={{ inbox: 2, today: 0 }} />);
    const tabs = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(["Today", "Inbox2", "Week", "Browse"]);
    expect(tabs[3]).toHaveAttribute("aria-current", "page");
    expect(tabs[1]).toHaveAccessibleName("Inbox, 2 to triage");
  });

  it("drops the badge at zero", () => {
    render(<TabBar pathname="/today" counts={{ inbox: 0, today: 5 }} />);
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveTextContent(/^Inbox$/);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });
});
