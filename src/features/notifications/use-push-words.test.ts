import { describe, expect, it } from "vitest";
import { pushErrorWords } from "./use-push";

describe("pushErrorWords", () => {
  it("says the window cannot receive reminders instead of the browser's 'permission denied' (seen in the walkthrough)", () => {
    expect(pushErrorWords(new DOMException("Registration failed - permission denied", "AbortError"))).toMatch(/^This window can’t receive reminders/);
    expect(pushErrorWords(new Error("Registration failed - push service error"))).toMatch(/^This window can’t receive reminders/);
  });

  it("passes the app's own words through", () => {
    expect(pushErrorWords(new Error("Push is not configured on this server."))).toBe("Push is not configured on this server.");
  });
});
