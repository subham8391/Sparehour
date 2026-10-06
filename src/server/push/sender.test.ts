import { describe, expect, it, vi } from "vitest";
import { personalise } from "./copy";
import { dayFigures, type DayContext, type DayFigures } from "./day-figures";
import type { NotificationKind, PushPayload } from "./delivery";
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

// A Monday in London: 09:00–18:00, two meetings (10:00–11:00 and 14:00–14:30, UTC+1 in October), one declined,
// one out of hours, a 45-minute block and two planned tasks. Capacity = 540 − 90 − 80 (15%) = 370 → "6h 10m".
const MONDAY: DayContext = {
  day: "2026-10-05",
  timezone: "Europe/London",
  buffer_pct: 15,
  default_estimate_min: 30,
  app_badge: 5,
  calendar_connected: true,
  work_hours: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_time: "09:00", end_time: "18:00" })),
  events: [
    { id: "m1", start_at: "2026-10-05T09:00:00+00:00", end_at: "2026-10-05T10:00:00+00:00", start_date: null, end_date: null, all_day: false, busy: true, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: false, calendar_read: true },
    { id: "m2", start_at: "2026-10-05T13:00:00+00:00", end_at: "2026-10-05T13:30:00+00:00", start_date: null, end_date: null, all_day: false, busy: true, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: false, calendar_read: true },
    { id: "declined", start_at: "2026-10-05T15:00:00+00:00", end_at: "2026-10-05T16:00:00+00:00", start_date: null, end_date: null, all_day: false, busy: true, status: "confirmed", self_response: "declined", event_type: "default", is_ours: false, calendar_read: true },
    { id: "late", start_at: "2026-10-05T19:00:00+00:00", end_at: "2026-10-05T20:00:00+00:00", start_date: null, end_date: null, all_day: false, busy: true, status: "confirmed", self_response: "accepted", event_type: "default", is_ours: false, calendar_read: true },
  ],
  blocks: [{ id: "b1", task_id: "t1", start_at: "2026-10-05T11:00:00+00:00", end_at: "2026-10-05T11:45:00+00:00" }],
  tasks: [
    { id: "t1", state: "active", do_date: "2026-10-05", estimate_min: 45, evening: false, day_sort_key: "a" },
    { id: "t2", state: "active", do_date: "2026-10-05", estimate_min: 60, evening: false, day_sort_key: "b" },
  ],
  done: 7,
};

describe("dayFigures: the numbers Today shows, at send time", () => {
  it("capacity is work − meetings − buffer; spare takes the block and the planned estimates off too", () => {
    expect(dayFigures(MONDAY)).toEqual({ badge: 5, hasCalendar: true, workDay: true, capacityMin: 370, meetings: 2, spareMin: 370 - 45 - 60, done: 7 });
  });

  it("a day without working hours has no capacity", () => {
    expect(dayFigures({ ...MONDAY, work_hours: [] })).toMatchObject({ workDay: false, capacityMin: 0, meetings: 0 });
  });
});

describe("personalise: notification words with the day's numbers (SCREENS.md §19)", () => {
  const stored = (kind: NotificationKind, title: string, body: string): PushPayload => ({ web_push: 8030, notification: { title, body, navigate: "/today" }, sh: { kind, actions: [] } });
  const figures: DayFigures = { badge: 3, hasCalendar: true, workDay: true, capacityMin: 340, meetings: 2, spareMin: 200, done: 7 };

  it("the morning nudge says what fits and how many meetings", () => {
    const p = personalise("morning", stored("morning", "Good morning.", "Plan your day — about 2 minutes."), figures);
    expect(p.notification).toMatchObject({ title: "Good morning. 5h 40m fits today.", body: "2 meetings. Plan your day — about 2 minutes.", app_badge: 3 });
    expect(personalise("morning", stored("morning", "Good morning.", "x"), { ...figures, meetings: 1 }).notification.body).toBe("1 meeting. Plan your day — about 2 minutes.");
    expect(personalise("morning", stored("morning", "Good morning.", "x"), { ...figures, meetings: 0 }).notification.body).toBe("No meetings. Plan your day — about 2 minutes.");
  });

  it("without a connected calendar the meetings clause is left out", () => {
    const p = personalise("morning", stored("morning", "Good morning.", "Plan your day — about 2 minutes."), { ...figures, hasCalendar: false, meetings: 0 });
    expect(p.notification.title).toBe("Good morning. 5h 40m fits today.");
    expect(p.notification.body).toBe("Plan your day — about 2 minutes.");
  });

  it("a day with nothing to fit keeps the plain greeting", () => {
    expect(personalise("morning", stored("morning", "Good morning.", "x"), { ...figures, capacityMin: 0 }).notification.title).toBe("Good morning.");
  });

  it("the day-of deadline carries the spare figure, and says nothing of it when there is none", () => {
    expect(personalise("deadline_day", stored("deadline_day", "Due today: Send the invoice", "~20m · planned for today"), figures).notification.body).toBe("~20m · you have 3h 20m spare");
    expect(personalise("deadline_day", stored("deadline_day", "Due today: Send the invoice", "not on today's list yet"), figures).notification.body).toBe("not on today's list · you have 3h 20m spare");
    expect(personalise("deadline_day", stored("deadline_day", "Due today: Send the invoice", "~20m · planned for today"), { ...figures, spareMin: -30 }).notification.body).toBe("~20m · planned for today");
  });

  it("the shutdown nudge counts what got done, and every kind carries the badge", () => {
    expect(personalise("shutdown", stored("shutdown", "Wrapping up?", "Two minutes to close the day."), figures).notification.body).toBe("7 done today. Two minutes to close the day.");
    expect(personalise("shutdown", stored("shutdown", "Wrapping up?", "Two minutes to close the day."), { ...figures, done: 0 }).notification.body).toBe("Two minutes to close the day.");
    const block = personalise("block_start", stored("block_start", "Draft", "09:00–09:45 · 45m"), { ...figures, badge: 0 });
    expect(block.notification).toEqual({ title: "Draft", body: "09:00–09:45 · 45m", navigate: "/today", app_badge: 0 });
  });

  it("without figures the stored payload goes as it is", () => {
    const p = stored("morning", "Good morning.", "Plan your day — about 2 minutes.");
    expect(personalise("morning", p, null)).toBe(p);
  });
});

describe("sendDue with the day's numbers", () => {
  const morning = (id: string, userId = "u1"): DueNotification => ({
    id,
    user_id: userId,
    kind: "morning",
    entity_id: null,
    payload: { web_push: 8030, notification: { title: "Good morning.", body: "Plan your day — about 2 minutes.", navigate: "/plan?src=push&kind=morning" }, sh: { kind: "morning", actions: ["plan", "dismiss"] } },
    fire_at: "2026-10-05T08:00:00Z",
  });

  it("reads each person's day once per tick and fills the words in before encrypting", async () => {
    const dayContext = vi.fn().mockResolvedValue(MONDAY);
    const d = deps({ claim: vi.fn().mockResolvedValue([morning("n1"), { ...due("n2"), fire_at: "2026-10-05T10:00:00Z" }]), dayContext });
    await sendDue(d, { appUrl: "https://sparehour.app" });
    expect(dayContext).toHaveBeenCalledTimes(1);
    const bodies = (d.push as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1]).notification);
    expect(bodies[0]).toMatchObject({ title: "Good morning. 6h 10m fits today.", body: "2 meetings. Plan your day — about 2 minutes.", app_badge: 5 });
    expect(bodies[2]).toMatchObject({ title: "Draft the proposal", app_badge: 5 });
  });

  it("when the day cannot be read the reminder still goes, as stored", async () => {
    const d = deps({ claim: vi.fn().mockResolvedValue([morning("n1")]), dayContext: vi.fn().mockRejectedValue(new Error("db down")) });
    const r = await sendDue(d, { appUrl: "https://sparehour.app" });
    expect(r.delivered).toBe(1);
    expect(JSON.parse((d.push as ReturnType<typeof vi.fn>).mock.calls[0][1]).notification).toMatchObject({ title: "Good morning.", body: "Plan your day — about 2 minutes." });
  });
});
