// The sender's pure parts (SYSTEM_DESIGN.md §7.2, §7.5): the headers each
// kind travels with, the payload made absolute for the push service, and
// what a push service's answer means for the subscription.

export type NotificationKind = "block_start" | "deadline_eve" | "deadline_day" | "morning" | "shutdown" | "urgent_repeat";

export interface PushPayload {
  web_push: number;
  notification: { title: string; body: string; navigate: string; lang?: string; silent?: boolean; app_badge?: number };
  sh: { kind: NotificationKind; task_id?: string | null; block_id?: string | null; actions: string[] };
}

export interface PushOptions {
  /** Seconds the push service may hold the message (RFC 8030). */
  TTL: number;
  urgency: "very-low" | "low" | "normal" | "high";
  /** ≤ 32 URL-safe chars; a newer message with the same topic replaces an unsent one. */
  topic: string;
}

/** A block start is useless late; a nudge can wait an hour; a deadline warning a day. */
export function pushOptions(kind: NotificationKind, entityId: string | null, fireAt: string): PushOptions {
  const ttl = kind === "block_start" ? 10 * 60 : kind === "morning" || kind === "shutdown" ? 60 * 60 : 24 * 60 * 60;
  const urgency = kind === "morning" || kind === "shutdown" ? "low" : "normal";
  return { TTL: ttl, urgency, topic: topicFor(kind, entityId, fireAt) };
}

/** `<kind>-<entity or day>` squeezed into the 32 URL-safe characters a topic allows. */
export function topicFor(kind: NotificationKind, entityId: string | null, fireAt: string): string {
  const tail = (entityId ?? fireAt.slice(0, 10)).replace(/[^A-Za-z0-9_-]/g, "");
  return `${kind.replace(/_/g, "-")}-${tail}`.slice(0, 32);
}

/** The bytes to encrypt: the stored payload with its `navigate` made absolute. */
export function serialisePayload(payload: PushPayload, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  const navigate = payload.notification.navigate.startsWith("/") ? `${base}${payload.notification.navigate}` : payload.notification.navigate;
  return JSON.stringify({ ...payload, notification: { ...payload.notification, navigate } });
}

export type DeliveryVerdict = "delivered" | "gone" | "retry" | "failed";

/** What a push service's status means (§7.5): 404/410 = the subscription is gone; 429/5xx = try again. */
export function classifyStatus(status: number | null): DeliveryVerdict {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "delivered";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "retry";
  return "failed";
}
