// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
    expect(expand).toHaveClass("hidden", "md:flex");
    await user.click(collapse);
    expect(document.documentElement.dataset.sidebar).toBe("rail");
    expect(localStorage.getItem("sparehour.sidebar")).toBe("rail");
    expect(expand).toHaveFocus();
    await user.click(expand);
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(collapse).toHaveFocus();
  });

  it("the rail's names carry the count and a tooltip, and its links suppress the iOS callout for the long-press label", () => {
    render(<Sidebar rail pathname="/inbox" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    const today = screen.getByRole("link", { name: "Today, 4" });
    expect(today).toHaveAttribute("title", "Today");
    expect(today.className).toContain("[-webkit-touch-callout:none]");
    expect(screen.getByRole("link", { name: "Settings" }).className).toContain("[-webkit-touch-callout:none]");
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
