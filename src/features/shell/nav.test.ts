import { describe, expect, it } from "vitest";
import { BROWSE_VIEWS, SIDEBAR_VIEWS, TAB_VIEWS, activeTab, countLabel, isActive, showsQuickAdd, showsTabBar } from "./nav";

describe("navigation model", () => {
  it("keeps the fixed sidebar order from the spec", () => {
    expect(SIDEBAR_VIEWS.map((v) => v.label)).toEqual(["Inbox", "Today", "Upcoming", "Calendar", "Someday", "Logbook"]);
  });

  it("only Inbox and Today carry a count", () => {
    expect(SIDEBAR_VIEWS.filter((v) => v.count).map((v) => v.id)).toEqual(["inbox", "today"]);
  });

  it("phone tabs are Today · Inbox · Week · Browse", () => {
    expect(TAB_VIEWS.map((v) => v.tabLabel)).toEqual(["Today", "Inbox", "Week", "Browse"]);
    expect(TAB_VIEWS.map((v) => v.href)).toEqual(["/today", "/inbox", "/upcoming", "/browse"]);
  });

  it("Browse holds Someday, Logbook and Settings", () => {
    expect(BROWSE_VIEWS.map((v) => v.id)).toEqual(["someday", "logbook", "settings"]);
  });

  it("a view is active for its path and nested paths only", () => {
    expect(isActive("/today", "/today")).toBe(true);
    expect(isActive("/project/abc", "/project")).toBe(true);
    expect(isActive("/todayish", "/today")).toBe(false);
    expect(isActive("/inbox", "/today")).toBe(false);
  });

  it("lights the right phone tab, with Browse owning the phone-sidebar routes", () => {
    expect(activeTab("/today")).toBe("today");
    expect(activeTab("/inbox")).toBe("inbox");
    expect(activeTab("/upcoming")).toBe("upcoming");
    for (const p of ["/browse", "/someday", "/logbook", "/settings", "/project/p1", "/area/a1"]) expect(activeTab(p)).toBe("browse");
    expect(activeTab("/calendar")).toBeNull();
  });

  it("the tab bar steps aside for the rituals and search only", () => {
    for (const p of ["/today", "/inbox", "/upcoming", "/browse", "/settings", "/logbook", "/project/p1"]) expect(showsTabBar(p)).toBe(true);
    for (const p of ["/plan", "/shutdown", "/search"]) expect(showsTabBar(p)).toBe(false);
  });

  it("the add bar and the FAB show on task lists only", () => {
    for (const p of ["/today", "/inbox", "/upcoming", "/someday", "/browse", "/project/p1", "/area/a1"]) expect(showsQuickAdd(p)).toBe(true);
    for (const p of ["/plan", "/shutdown", "/search", "/settings", "/calendar", "/logbook"]) expect(showsQuickAdd(p)).toBe(false);
  });

  it("never shows a zero count", () => {
    expect(countLabel(0)).toBeNull();
    expect(countLabel(undefined)).toBeNull();
    expect(countLabel(3)).toBe("3");
  });
});
