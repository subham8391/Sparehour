// Reminders to the phone app (docs/mobile/ANDROID_APP_SPEC.md §6): the same
// payload the browser gets, as a message for Expo's push service, which hands
// it to Android's (Firebase). The app turns a reminder's kind into its buttons
// (the notification category) and its `navigate` into the screen to open, with
// the same parseDeepLink the web uses. Expo's answer is put in the push
// services' own terms (an HTTP-like status) so the sender and the database
// treat a phone exactly as they treat a browser.
import type { PushOptions, PushPayload } from "./delivery";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** A phone's row in public.app_push_tokens, as the sender needs it. */
export interface AppTokenRow {
  id: string;
  token: string;
}

/** What Expo's push service is given for one phone. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { navigate: string; kind: string; task_id: string | null; block_id: string | null };
  channelId: "reminders";
  categoryId: string;
  priority: "default" | "high";
  /** Seconds Firebase may hold it: the same as the browser's TTL. */
  ttl: number;
  sound?: "default";
  badge?: number;
}

/** A token as Expo's service hands one out (`ExponentPushToken[…]`, or the newer `ExpoPushToken[…]`). */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/.test(value);
}

/** The app opens a path, not the web's address: `https://…/today?src=push…` becomes `/today?src=push…`. */
export function appPath(navigate: string): string {
  if (navigate.startsWith("/")) return navigate;
  try {
    const url = new URL(navigate);
    return `${url.pathname}${url.search}`;
  } catch {
    return "/today";
  }
}

/** One phone's message from the serialised payload the browser would get. */
export function expoMessage(token: string, body: string, options: PushOptions): ExpoMessage {
  const payload = JSON.parse(body) as PushPayload;
  const n = payload.notification;
  return {
    to: token,
    title: n.title,
    body: n.body,
    data: { navigate: appPath(n.navigate), kind: payload.sh.kind, task_id: payload.sh.task_id ?? null, block_id: payload.sh.block_id ?? null },
    channelId: "reminders",
    categoryId: payload.sh.kind,
    priority: options.urgency === "low" || options.urgency === "very-low" ? "default" : "high",
    ttl: options.TTL,
    ...(n.silent ? {} : { sound: "default" as const }),
    ...(typeof n.app_badge === "number" ? { badge: n.app_badge } : {}),
  };
}

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo's answer for one message as a push service's status: delivered (200); the phone is gone (410, the token is
 * retired); too many (429) and Expo's own trouble (5xx) are tried again; anything else is a hard failure (400).
 */
export function ticketStatus(ticket: ExpoTicket | undefined): { statusCode: number; message: string | null } {
  if (ticket?.status === "ok") return { statusCode: 200, message: null };
  const error = ticket?.details?.error;
  const message = (ticket?.message ?? error ?? "no answer from Expo").slice(0, 500);
  if (error === "DeviceNotRegistered") return { statusCode: 410, message };
  if (error === "MessageRateExceeded") return { statusCode: 429, message };
  return { statusCode: 400, message };
}

/** Sends one message. Resolves with a 2xx status; rejects with `{ statusCode?, message }`, as web-push does. */
export async function sendExpo(message: ExpoMessage, opts: { fetch?: typeof fetch; accessToken?: string } = {}): Promise<{ statusCode: number }> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
    },
    body: JSON.stringify([message]),
  });
  if (!res.ok) throw { statusCode: res.status, message: `Expo answered ${res.status}` };
  const answer = (await res.json().catch(() => null)) as { data?: ExpoTicket[] | ExpoTicket } | null;
  const ticket = Array.isArray(answer?.data) ? answer.data[0] : answer?.data;
  const { statusCode, message: why } = ticketStatus(ticket);
  if (statusCode >= 200 && statusCode < 300) return { statusCode };
  throw { statusCode, message: why };
}
