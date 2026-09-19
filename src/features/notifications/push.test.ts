import { describe, expect, it } from "vitest";
import { actionsFor, supportsActions, withAction } from "./actions";
import { detectPushPlatform, parseDeepLink, permissionCopy, platformKey, readPermission, subscriptionRow, urlBase64ToUint8Array, type PushPlatform } from "./push";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0";

const platform = (ua: string, standalone = false): PushPlatform => detectPushPlatform({ userAgent: ua }, standalone);

describe("platform", () => {
  it("tells the platforms apart and names the subscription's platform", () => {
    expect(platform(CHROME)).toMatchObject({ isIOS: false, isSafari: false, isFirefox: false });
    expect(platform(SAFARI)).toMatchObject({ isIOS: false, isSafari: true });
    expect(platform(IPHONE)).toMatchObject({ isIOS: true, isSafari: true });
    expect(platform(FIREFOX)).toMatchObject({ isFirefox: true, isSafari: false });
    expect(platformKey(platform(IPHONE, true))).toBe("ios-standalone");
    expect(platformKey(platform(IPHONE))).toBe("other");
    expect(platformKey(platform(ANDROID))).toBe("android");
    expect(platformKey(platform(CHROME))).toBe("desktop");
  });

  it("buttons exist on Chrome, Firefox and Android, never on Safari or iOS", () => {
    expect(supportsActions(CHROME)).toBe(true);
    expect(supportsActions(FIREFOX)).toBe(true);
    expect(supportsActions(ANDROID)).toBe(true);
    expect(supportsActions(SAFARI)).toBe(false);
    expect(supportsActions(IPHONE)).toBe(false);
  });

  it("reads the permission, or unsupported without the APIs or a secure context", () => {
    expect(readPermission({ Notification: { permission: "granted" }, PushManager: {}, isSecureContext: true })).toBe("granted");
    expect(readPermission({ Notification: { permission: "default" }, PushManager: {} })).toBe("default");
    expect(readPermission({ PushManager: {} })).toBe("unsupported");
    expect(readPermission({ Notification: { permission: "granted" } })).toBe("unsupported");
    expect(readPermission({ Notification: { permission: "granted" }, PushManager: {}, isSecureContext: false })).toBe("unsupported");
  });
});

describe("permissionCopy", () => {
  it("says what is true and offers the one useful thing", () => {
    expect(permissionCopy("default", platform(CHROME), false, true)).toMatchObject({ headline: "Reminders are off.", action: "enable" });
    expect(permissionCopy("granted", platform(CHROME), true, true)).toMatchObject({ headline: "Reminders are on for this device.", action: "disable" });
    expect(permissionCopy("granted", platform(CHROME), false, true)).toMatchObject({ action: "enable" });
    expect(permissionCopy("denied", platform(CHROME), false, true)).toMatchObject({ headline: "Blocked in your browser.", action: null, steps: ["Click the icon left of the address bar", "Notifications → Allow"] });
    expect(permissionCopy("denied", platform(FIREFOX), false, true).steps[0]).toMatch(/permissions icon/);
    // A touch device has no address bar to point at, whatever its user agent says.
    expect(permissionCopy("denied", platform(ANDROID), false, true).steps[0]).toMatch(/browser's menu/);
    expect(permissionCopy("denied", detectPushPlatform({ userAgent: CHROME, maxTouchPoints: 5 }, false), false, true).steps[0]).toMatch(/browser's menu/);
    expect(permissionCopy("denied", platform(SAFARI), false, true).steps[0]).toMatch(/Safari → Settings/);
    expect(permissionCopy("denied", platform(IPHONE, true), false, true).steps[0]).toMatch(/Settings → Notifications/);
    expect(permissionCopy("unsupported", platform(CHROME), false, true)).toMatchObject({ action: null });
  });

  it("on an iPhone in the browser, the answer is the Home Screen first; without a worker, it says so", () => {
    expect(permissionCopy("default", platform(IPHONE), false, true)).toMatchObject({ action: "install", headline: "Reminders need the Home Screen app." });
    expect(permissionCopy("unsupported", platform(IPHONE), false, false).detail).toMatch(/Home Screen/);
    expect(permissionCopy("default", platform(CHROME), false, false)).toMatchObject({ action: null, headline: "Reminders aren't available in this build." });
  });
});

describe("subscription and keys", () => {
  it("turns the VAPID key into bytes", () => {
    const bytes = urlBase64ToUint8Array("BA-_"); // 0x04 0x0f 0xbf
    expect(Array.from(bytes)).toEqual([4, 15, 191]);
    expect(urlBase64ToUint8Array("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VE-JTUVmsSS1Y3vWaBq5aXeNbcA8sGcZJXfkT6VJkCgv0Tt4z5qB3Dhk4gI").length).toBe(65);
  });

  it("keeps the row we send, and refuses a subscription without keys", () => {
    const row = subscriptionRow({ endpoint: "https://push.test/abc", keys: { p256dh: "P", auth: "A" } }, platform(IPHONE, true));
    expect(row).toEqual({ endpoint: "https://push.test/abc", p256dh: "P", auth: "A", ua: IPHONE, platform: "ios-standalone", declarative: true });
    expect(subscriptionRow({ endpoint: "https://push.test/abc", keys: { p256dh: "P", auth: "A" } }, platform(CHROME))?.declarative).toBe(false);
    expect(subscriptionRow({ endpoint: "https://push.test/abc" }, platform(CHROME))).toBeNull();
    expect(subscriptionRow({ endpoint: null, keys: { p256dh: "P", auth: "A" } }, platform(CHROME))).toBeNull();
  });
});

describe("deep links and actions", () => {
  it("reads a notification's link, with or without a pressed button", () => {
    expect(parseDeepLink(new URLSearchParams("src=push&kind=block_start&task=t1&block=b1"))).toEqual({ kind: "block_start", taskId: "t1", blockId: "b1", action: null });
    expect(parseDeepLink(new URLSearchParams("src=push&kind=deadline_eve&task=t1&action=tomorrow"))).toEqual({ kind: "deadline_eve", taskId: "t1", blockId: null, action: "tomorrow" });
    expect(parseDeepLink(new URLSearchParams("src=push&kind=morning&action=bogus"))?.action).toBeNull();
    expect(parseDeepLink(new URLSearchParams("src=push&kind=nope"))).toBeNull();
    expect(parseDeepLink(new URLSearchParams("quickadd=1"))).toBeNull();
  });

  it("each kind offers its own three (or two) choices, and a button appends its action", () => {
    expect(actionsFor("block_start").map((a) => a.id)).toEqual(["start", "snooze", "plan"]);
    expect(actionsFor("deadline_eve").map((a) => a.label)).toEqual(["Today", "Tomorrow", "Plan"]);
    expect(actionsFor("deadline_day").map((a) => a.id)).toEqual(["today", "plan"]);
    expect(actionsFor("morning").map((a) => a.label)).toEqual(["Plan", "Not today"]);
    expect(actionsFor("shutdown").map((a) => a.id)).toEqual(["shutdown", "dismiss"]);
    expect(withAction("/today?src=push&kind=block_start", "snooze")).toBe("/today?src=push&kind=block_start&action=snooze");
    expect(withAction("/plan", "plan")).toBe("/plan?action=plan");
    expect(withAction("/plan", "")).toBe("/plan");
  });
});
