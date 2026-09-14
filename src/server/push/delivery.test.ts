import { describe, expect, it } from "vitest";
import { classifyStatus, pushOptions, serialisePayload, topicFor, type PushPayload } from "./delivery";

describe("pushOptions", () => {
  it("gives each kind a TTL, urgency and topic the push service can dedupe on", () => {
    expect(pushOptions("block_start", "6f1e2c9a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", "2026-09-14T09:00:00Z")).toEqual({ TTL: 600, urgency: "normal", topic: "block-start-6f1e2c9a-3b4d-4e5f-8" });
    expect(pushOptions("morning", null, "2026-09-15T07:30:00Z")).toEqual({ TTL: 3600, urgency: "low", topic: "morning-2026-09-15" });
    expect(pushOptions("deadline_eve", "t1", "2026-09-14T17:00:00Z")).toMatchObject({ TTL: 86400, urgency: "normal", topic: "deadline-eve-t1" });
  });

  it("topics stay within 32 URL-safe characters", () => {
    const topic = topicFor("deadline_day", "6f1e2c9a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", "2026-09-14T09:00:00Z");
    expect(topic.length).toBeLessThanOrEqual(32);
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("serialisePayload", () => {
  const payload: PushPayload = {
    web_push: 8030,
    notification: { title: "Draft the proposal", body: "09:00–09:45 · 45m · starts now", navigate: "/today?src=push&task=t1", lang: "en-GB", silent: false },
    sh: { kind: "block_start", task_id: "t1", block_id: "b1", actions: ["start", "snooze", "plan"] },
  };

  it("makes the deep link absolute and keeps everything else byte-for-byte", () => {
    const out = JSON.parse(serialisePayload(payload, "https://sparehour.app/"));
    expect(out.notification.navigate).toBe("https://sparehour.app/today?src=push&task=t1");
    expect(out.web_push).toBe(8030);
    expect(out.sh).toEqual(payload.sh);
    expect(JSON.parse(serialisePayload({ ...payload, notification: { ...payload.notification, navigate: "https://elsewhere.test/x" } }, "https://sparehour.app")).notification.navigate).toBe("https://elsewhere.test/x");
  });
});

describe("classifyStatus", () => {
  it("reads the push service's answer the way §7.5 says", () => {
    expect(classifyStatus(201)).toBe("delivered");
    expect(classifyStatus(404)).toBe("gone");
    expect(classifyStatus(410)).toBe("gone");
    expect(classifyStatus(429)).toBe("retry");
    expect(classifyStatus(503)).toBe("retry");
    expect(classifyStatus(null)).toBe("retry");
    expect(classifyStatus(400)).toBe("failed");
    expect(classifyStatus(403)).toBe("failed");
  });
});
