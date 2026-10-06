// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_VALUES, WORK_WEEK } from "@/test/settings";
import { SECTIONS, parseSection, sectionSummary, type SectionKey } from "./sections";
import { SettingsLayout, useSettingsSection } from "./settings-layout";

vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: vi.fn() }) }));

/** jsdom has no layout: say which band the window is in. */
function band(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 900px") ? wide : false, media: query, addEventListener() {}, removeEventListener() {} }));
}

function Harness() {
  const active = useSettingsSection();
  const items = SECTIONS.map((s) => ({ ...s, summary: `${s.title} summary` }));
  return <SettingsLayout items={items} active={active} render={(key: SectionKey) => <p>Section body: {key}</p>} />;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/settings");
  // jsdom does not scroll.
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings layout", () => {
  it("on the phone the list is one screen with summaries; a section pushes in, and Back (header or browser) returns to the list", async () => {
    band(false);
    const user = userEvent.setup();
    render(<Harness />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(SECTIONS.map((s) => `${s.title}${s.title} summary`));
    expect(screen.getByRole("heading", { level: 1, name: "Your day" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("link", { name: /^Working hours/ }));
    expect(window.location.hash).toBe("#working-hours");
    expect(screen.getByText("Section body: working-hours")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1, name: "Working hours" });
    expect(heading).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    // history.back() is asynchronous in a browser; jsdom fires popstate after a tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { level: 1, name: "Working hours" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /^Working hours/ })).toHaveFocus();
  });

  it("a link straight to /settings#calendar lands on Calendar, and its Back goes to the list without leaving Settings", async () => {
    band(false);
    window.history.replaceState(null, "", "/settings#calendar");
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("Section body: calendar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(window.location.pathname).toBe("/settings");
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { level: 1, name: "Calendar" })).not.toBeInTheDocument();
  });

  it("in two columns the first section shows beside the list, the open one is marked, and a choice replaces the entry", async () => {
    band(true);
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Section body: account")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("link", { name: /^Account/ })).toHaveAttribute("aria-current", "page");
    const length = window.history.length;
    await user.click(within(nav).getByRole("link", { name: /^Data/ }));
    expect(window.location.hash).toBe("#data");
    expect(window.history.length).toBe(length);
    expect(screen.getByText("Section body: data")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /^Data/ })).toHaveAttribute("aria-current", "page");
  });

  it("arrow keys, Home and End move along the list", () => {
    band(true);
    render(<Harness />);
    const links = within(screen.getByRole("navigation", { name: "Settings sections" })).getAllByRole("link");
    links[0].focus();
    fireEvent.keyDown(links[0], { key: "ArrowDown" });
    expect(links[1]).toHaveFocus();
    fireEvent.keyDown(links[1], { key: "End" });
    expect(links[links.length - 1]).toHaveFocus();
    fireEvent.keyDown(links[links.length - 1], { key: "ArrowDown" });
    expect(links[links.length - 1]).toHaveFocus();
    fireEvent.keyDown(links[links.length - 1], { key: "Home" });
    expect(links[0]).toHaveFocus();
    fireEvent.keyDown(links[0], { key: "ArrowUp" });
    expect(links[0]).toHaveFocus();
  });
});

describe("sections", () => {
  it("parses a hash into a section, and anything else is the list", () => {
    expect(parseSection("#calendar")).toBe("calendar");
    expect(parseSection("#data")).toBe("data");
    expect(parseSection("working-hours")).toBe("working-hours");
    expect(parseSection("")).toBeNull();
    expect(parseSection("#nope")).toBeNull();
  });

  it("each section has a one-line summary in plain words", () => {
    const input = { values: SETTINGS_VALUES, workHours: WORK_WEEK, email: "dev@sparehour.local", calendars: { accounts: 1, busy: 2 }, subscribed: true, motion: "reduce" as const, version: "abc123" };
    expect(sectionSummary("account", input)).toBe("dev@sparehour.local · Europe/London");
    expect(sectionSummary("working-hours", input)).toBe("Mon–Fri · 09:00–18:00 · buffer 15%");
    expect(sectionSummary("calendar", input)).toBe("1 account · 2 counted as busy");
    expect(sectionSummary("calendar", { ...input, calendars: { accounts: 0, busy: 0 } })).toBe("Not connected");
    expect(sectionSummary("notifications", input)).toBe("On for this device · quiet 21:00–08:00");
    expect(sectionSummary("notifications", { ...input, subscribed: null, values: { ...SETTINGS_VALUES, quietHoursStart: "", quietHoursEnd: "" } })).toBe("Reminders and quiet hours");
    expect(sectionSummary("planning", input)).toBe("Ask after 3 carries · missed tasks carry · opens to Today");
    expect(sectionSummary("appearance", input)).toBe("System theme · reduced motion");
    expect(sectionSummary("data", input)).toBe("Export JSON · Markdown · CSV");
    expect(sectionSummary("app", input)).toBe("Install, storage · version abc123");
  });
});
