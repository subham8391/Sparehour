import { describe, expect, it } from "vitest";
import { badgeCount } from "./use-app-badge";

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
