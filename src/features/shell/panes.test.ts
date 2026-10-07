// @vitest-environment jsdom
// The per-device layout choices (SCREENS.md §1 "Sidebar", "Context pane"): stamped on <html>, remembered on this
// device, stamped again by the head script before the first paint so a folded sidebar never flashes open.
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_BOOTSTRAP } from "@/features/commands/theme-bootstrap";
import { PANES_KEY, PANE_MAX, PANE_MIN, paneCss } from "./pane-resizer";
import { atLeast, needsWidth, prefOn, setPref, toggleSidebar } from "./panes";

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  delete root.dataset.sidebar;
  delete root.dataset.dayPane;
  document.getElementById("pane-w")?.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("layout choices", () => {
  it("setPref stamps <html> and remembers it; without a value it flips", () => {
    setPref("dayPane", true);
    expect(root.dataset.dayPane).toBe("hidden");
    expect(localStorage.getItem("sparehour.dayPane")).toBe("hidden");
    expect(prefOn("dayPane")).toBe(true);
    setPref("dayPane");
    expect(root.dataset.dayPane).toBeUndefined();
    expect(localStorage.getItem("sparehour.dayPane")).toBeNull();
    setPref("dayPane", false);
    expect(prefOn("dayPane")).toBe(false);
  });

  it("holds for the visit when storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    setPref("sidebar", true);
    expect(root.dataset.sidebar).toBe("rail");
    vi.restoreAllMocks();
  });

  it("toggleSidebar moves focus from the nav that goes to the other one's toggle", () => {
    document.body.innerHTML = `
      <nav data-variant="rail"><button data-sidebar-toggle>Expand sidebar</button></nav>
      <nav data-variant="full"><button data-sidebar-toggle>Collapse sidebar</button><a href="/inbox">Inbox</a></nav>`;
    const [expand, collapse] = document.querySelectorAll<HTMLElement>("[data-sidebar-toggle]");
    collapse.focus();
    toggleSidebar();
    expect(root.dataset.sidebar).toBe("rail");
    expect(localStorage.getItem("sparehour.sidebar")).toBe("rail");
    expect(document.activeElement).toBe(expand);
    toggleSidebar();
    expect(root.dataset.sidebar).toBeUndefined();
    expect(document.activeElement).toBe(collapse);
    // Focus elsewhere stays where it is.
    const link = document.querySelector<HTMLElement>("main, a") as HTMLElement;
    document.body.insertAdjacentHTML("beforeend", "<input id='q' />");
    const q = document.getElementById("q") as HTMLInputElement;
    q.focus();
    toggleSidebar();
    expect(document.activeElement).toBe(q);
    expect(link).toBeTruthy();
  });

  it("the head script stamps the stored choices and the panes' widths before the first paint", () => {
    localStorage.setItem("sparehour.sidebar", "rail");
    localStorage.setItem("sparehour.dayPane", "hidden");
    localStorage.setItem(PANES_KEY, JSON.stringify({ today: 400, inbox: 9000, "bad]": 400 }));
    new Function(THEME_BOOTSTRAP)();
    expect(root.dataset.sidebar).toBe("rail");
    expect(root.dataset.dayPane).toBe("hidden");
    expect(document.getElementById("pane-w")?.textContent).toBe('[data-view="today"]{--pane-w:400px}[data-view="inbox"]{--pane-w:560px}');
    // The island draws the same rules from the same widths, inside the same range.
    expect(paneCss({ today: 400, inbox: 9000, "bad]": 400 })).toBe(document.getElementById("pane-w")?.textContent);
    localStorage.setItem(PANES_KEY, JSON.stringify({ today: 1 }));
    document.getElementById("pane-w")?.remove();
    new Function(THEME_BOOTSTRAP)();
    expect(document.getElementById("pane-w")?.textContent).toContain(`--pane-w:${PANE_MIN}px`);
    expect(PANE_MAX).toBe(560);
  });

  it("a broken widths entry leaves the rest of the head script working", () => {
    localStorage.setItem(PANES_KEY, "{not json");
    localStorage.setItem("sparehour.theme", "dark");
    new Function(THEME_BOOTSTRAP)();
    expect(document.getElementById("pane-w")).toBeNull();
    expect(root.dataset.theme).toBe("dark");
    delete root.dataset.theme;
  });

  it("measures the viewport with matchMedia, and says why a pane command is off below its band", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(min-width: 640px)" }));
    expect(atLeast(640)).toBe(true);
    expect(atLeast(900)).toBe(false);
    expect(needsWidth(640)()).toBeNull();
    expect(needsWidth(900)()).toBe("on a wider screen");
  });
});
