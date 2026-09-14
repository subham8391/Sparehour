import { describe, expect, it, vi } from "vitest";
import type { PushPayload } from "./delivery";
import { sendDue, type DueNotification, type PushSubscriptionRow, type SenderDeps } from "./sender";

const payload: PushPayload = {
  web_push: 8030,
  notification: { title: "Draft the proposal", body: "09:00–09:45 · 45m · starts now", navigate: "/today?src=push&task=t1" },
  sh: { kind: "block_start", task_id: "t1", block_id: "b1", actions: ["start", "snooze", "plan"] },
};
const due = (id: string, userId = "u1"): DueNotification => ({ id, user_id: userId, kind: "block_start", entity_id: "b1", payload, fire_at: "2026-09-14T09:00:00Z" });
const sub = (id: string): PushSubscriptionRow => ({ id, endpoint: `https://push.test/${id}`, p256dh: "k", auth: "a" });

function deps(over: Partial<SenderDeps> = {}) {
  const d: SenderDeps = {
    claim: vi.fn().mockResolvedValue([due("n1")]),
    subscriptionsFor: vi.fn().mockResolvedValue([sub("s1"), sub("s2")]),
    push: vi.fn().mockResolvedValue({ statusCode: 201 }),
    record: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return d;
}

describe("sendDue", () => {
  it("pushes each due notification to every live subscription with the kind's headers and an absolute deep link", async () => {
    const d = deps();
    const r = await sendDue(d, { appUrl: "https://sparehour.app" });
    expect(r).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0, unreachable: 0 });
    expect(d.push).toHaveBeenCalledTimes(2);
    const [s, body, options] = (d.push as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(s.id).toBe("s1");
    expect(JSON.parse(body).notification.navigate).toBe("https://sparehour.app/today?src=push&task=t1");
    expect(options).toMatchObject({ TTL: 600, urgency: "normal" });
    expect(d.record).toHaveBeenCalledWith("n1", "s1", 201, null);
    expect(d.finish).toHaveBeenCalledWith("n1", "sent");
  });

  it("a gone subscription is recorded as such and does not stop delivery to the others", async () => {
    const d = deps({
      push: vi.fn().mockRejectedValueOnce({ statusCode: 410, message: "Gone" }).mockResolvedValueOnce({ statusCode: 201 }),
    });
    const r = await sendDue(d, { appUrl: "https://sparehour.app" });
    expect(r.delivered).toBe(1);
    expect(d.record).toHaveBeenNthCalledWith(1, "n1", "s1", 410, "Gone");
    expect(d.record).toHaveBeenNthCalledWith(2, "n1", "s2", 201, null);
    expect(d.finish).toHaveBeenCalledWith("n1", "sent");
  });

  it("only transient failures hand the notification back for a retry; hard failures end it", async () => {
    const retry = deps({ push: vi.fn().mockRejectedValue({ statusCode: 503, message: "busy" }) });
    expect((await sendDue(retry, { appUrl: "https://sparehour.app" })).retried).toBe(1);
    expect(retry.finish).toHaveBeenCalledWith("n1", "retry");

    const network = deps({ push: vi.fn().mockRejectedValue(new Error("ECONNRESET")) });
    expect((await sendDue(network, { appUrl: "https://sparehour.app" })).retried).toBe(1);
    expect(network.record).toHaveBeenCalledWith("n1", "s1", null, "ECONNRESET");

    const hard = deps({ push: vi.fn().mockRejectedValue({ statusCode: 400, message: "bad key" }) });
    expect((await sendDue(hard, { appUrl: "https://sparehour.app" })).failed).toBe(1);
    expect(hard.finish).toHaveBeenCalledWith("n1", "failed");
  });

  it("with no live subscription there is nothing to send, and the row is closed rather than retried forever", async () => {
    const d = deps({ subscriptionsFor: vi.fn().mockResolvedValue([]) });
    const r = await sendDue(d, { appUrl: "https://sparehour.app" });
    expect(r).toMatchObject({ claimed: 1, unreachable: 1, delivered: 0 });
    expect(d.push).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenCalledWith("n1", "sent");
  });

  it("passes the limit through and does nothing on a quiet tick", async () => {
    const d = deps({ claim: vi.fn().mockResolvedValue([]) });
    const r = await sendDue(d, { appUrl: "https://sparehour.app", limit: 7 });
    expect(d.claim).toHaveBeenCalledWith(7);
    expect(r).toEqual({ claimed: 0, delivered: 0, retried: 0, failed: 0, unreachable: 0 });
  });
});
