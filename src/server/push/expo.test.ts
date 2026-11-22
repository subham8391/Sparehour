import { describe, expect, it, vi } from "vitest";
import { pushOptions, serialisePayload, type PushPayload } from "./delivery";
import { EXPO_PUSH_URL, appPath, expoMessage, isExpoPushToken, sendExpo, ticketStatus } from "./expo";

const TOKEN = "ExponentPushToken[abc_DEF-123]";
const block: PushPayload = {
  web_push: 8030,
  notification: { title: "Draft the proposal", body: "09:00–09:45 · 45m · starts now", navigate: "/today?src=push&kind=block_start&task=t1&block=b1", app_badge: 3 },
  sh: { kind: "block_start", task_id: "t1", block_id: "b1", actions: ["start", "snooze", "plan"] },
};
const morning: PushPayload = {
  web_push: 8030,
  notification: { title: "Good morning.", body: "Plan your day — about 2 minutes.", navigate: "/plan?src=push&kind=morning", silent: true },
  sh: { kind: "morning", actions: ["plan", "dismiss"] },
};
const body = (p: PushPayload) => serialisePayload(p, "https://sparehour.app");

describe("isExpoPushToken", () => {
  it("takes Expo's tokens, old and new spelling, and nothing else", () => {
    expect(isExpoPushToken(TOKEN)).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xyz]")).toBe(true);
    for (const bad of ["", "ExponentPushToken[]", "ExponentPushToken[a b]", "https://push.test/1", "ExponentPushToken[x]; drop", 42, null]) expect(isExpoPushToken(bad)).toBe(false);
  });
});

describe("appPath", () => {
  it("keeps the path and the query of the web's address, and passes a path through", () => {
    expect(appPath("https://sparehour.app/today?src=push&task=t1")).toBe("/today?src=push&task=t1");
    expect(appPath("/plan?src=push")).toBe("/plan?src=push");
    expect(appPath("not a url")).toBe("/today");
  });
});

describe("expoMessage", () => {
  it("carries the browser's words, the kind's buttons, the app's path, the badge and the browser's lifetime", () => {
    const m = expoMessage(TOKEN, body(block), pushOptions("block_start", "b1", "2026-11-22T09:00:00Z"));
    expect(m).toEqual({
      to: TOKEN,
      title: "Draft the proposal",
      body: "09:00–09:45 · 45m · starts now",
      data: { navigate: "/today?src=push&kind=block_start&task=t1&block=b1", kind: "block_start", task_id: "t1", block_id: "b1" },
      channelId: "reminders",
      categoryId: "block_start",
      priority: "high",
      ttl: 600,
      sound: "default",
      badge: 3,
    });
  });

  it("a silent, low-urgency nudge goes without a sound and at the default priority", () => {
    const m = expoMessage(TOKEN, body(morning), pushOptions("morning", null, "2026-11-22T08:00:00Z"));
    expect(m.sound).toBeUndefined();
    expect(m.badge).toBeUndefined();
    expect(m.priority).toBe("default");
    expect(m.ttl).toBe(3600);
    expect(m.data).toEqual({ navigate: "/plan?src=push&kind=morning", kind: "morning", task_id: null, block_id: null });
  });
});

describe("ticketStatus", () => {
  it("puts Expo's answer in the push services' terms", () => {
    expect(ticketStatus({ status: "ok" })).toEqual({ statusCode: 200, message: null });
    expect(ticketStatus({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } })).toEqual({ statusCode: 410, message: "gone" });
    expect(ticketStatus({ status: "error", details: { error: "MessageRateExceeded" } }).statusCode).toBe(429);
    expect(ticketStatus({ status: "error", details: { error: "InvalidCredentials" } }).statusCode).toBe(400);
    expect(ticketStatus(undefined)).toEqual({ statusCode: 400, message: "no answer from Expo" });
  });
});

describe("sendExpo", () => {
  const message = expoMessage(TOKEN, body(block), pushOptions("block_start", "b1", "2026-11-22T09:00:00Z"));
  const reply = (status: number, json: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }));

  it("posts the message to Expo and resolves when it is taken", async () => {
    const fetch = reply(200, { data: [{ status: "ok", id: "x" }] });
    await expect(sendExpo(message, { fetch })).resolves.toEqual({ statusCode: 200 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(JSON.parse(init.body)).toEqual([message]);
    expect(init.headers.authorization).toBeUndefined();
  });

  it("sends the access token when the server has one", async () => {
    const fetch = reply(200, { data: [{ status: "ok" }] });
    await sendExpo(message, { fetch, accessToken: "secret" });
    expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer secret");
  });

  it("rejects as web-push does: a gone phone with 410, Expo's own trouble with its status", async () => {
    await expect(sendExpo(message, { fetch: reply(200, { data: [{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }] }) })).rejects.toEqual({ statusCode: 410, message: "not registered" });
    await expect(sendExpo(message, { fetch: reply(503, {}) })).rejects.toEqual({ statusCode: 503, message: "Expo answered 503" });
    await expect(sendExpo(message, { fetch: reply(200, { data: { status: "ok" } }) })).resolves.toEqual({ statusCode: 200 });
  });
});
