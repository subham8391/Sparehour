// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { badgeCount, titleWithCount, useAppBadge } from "./use-app-badge";

let badgeRow: { enabled: number | null; shutdown_at: string | null } = { enabled: 1, shutdown_at: null };
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [badgeRow] }) }));
vi.mock("@/features/shell/use-local-day", () => ({ useNow: () => null, useLocalDay: () => ({ today: { toString: () => "2026-10-06" } }) }));

describe("badgeCount (PRODUCT_SPEC.md §14 rule 6)", () => {
  const base = { count: 4, enabled: true, shutDown: false, permission: "granted" as const };

  it("shows today's remaining count once notifications are allowed", () => {
    expect(badgeCount(base)).toBe(4);
    expect(badgeCount({ ...base, count: 0 })).toBe(0);
  });

  it("leaves the icon alone until permission is granted", () => {
    expect(badgeCount({ ...base, permission: "default" })).toBeNull();
    expect(badgeCount({ ...base, permission: "denied" })).toBeNull();
    expect(badgeCount({ ...base, permission: "unsupported" })).toBeNull();
  });

  it("clears at once when the badge is turned off", () => {
    expect(badgeCount({ ...base, enabled: false })).toBe(0);
  });

  it("is 0 after the evening shutdown, until the day rolls over and the shutdown belongs to yesterday", () => {
    expect(badgeCount({ ...base, shutDown: true })).toBe(0);
    // The next day's plan has no shutdown yet: the count is back.
    expect(badgeCount({ ...base, shutDown: false, count: 6 })).toBe(6);
  });
});

describe("the tab-title fallback (SYSTEM_DESIGN.md §7.3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    badgeRow = { enabled: 1, shutdown_at: null };
    document.title = "Sparehour";
  });

  it("puts the count in front of the title, and takes it off at 0", () => {
    expect(titleWithCount("Sparehour", 3)).toBe("(3) Sparehour");
    expect(titleWithCount("(3) Sparehour", 5)).toBe("(5) Sparehour");
    expect(titleWithCount("(5) Sparehour", 0)).toBe("Sparehour");
  });

  it("where there is no Badging API the title carries the count on the same rules, and keeps it when the page retitles", async () => {
    expect("setAppBadge" in navigator).toBe(false);
    document.title = "Sparehour";
    vi.stubGlobal("Notification", { permission: "default" });
    const { unmount } = renderHook(() => useAppBadge(3));
    // Not before reminders are allowed.
    expect(document.title).toBe("Sparehour");
    unmount();

    vi.stubGlobal("Notification", { permission: "granted" });
    const hook = renderHook(({ n }) => useAppBadge(n), { initialProps: { n: 3 } });
    expect(document.title).toBe("(3) Sparehour");
    hook.rerender({ n: 2 });
    expect(document.title).toBe("(2) Sparehour");
    // A navigation that writes the plain title again gets the count back.
    document.title = "Sparehour";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe("(2) Sparehour");
    hook.unmount();
    expect(document.title).toBe("Sparehour");

    // Off in Settings, or the day shut down: no count.
    badgeRow = { enabled: 0, shutdown_at: null };
    renderHook(() => useAppBadge(4));
    expect(document.title).toBe("Sparehour");
  });
});
