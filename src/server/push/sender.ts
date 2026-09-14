// One tick of the sender (SYSTEM_DESIGN.md §7.4–7.5): claim what is due,
// push it to every live subscription the person has, record each answer,
// and hand a notification back for a retry when no subscription took it
// for a transient reason. The transport and the database are injected so
// the loop is tested without either.
import { classifyStatus, pushOptions, serialisePayload, type NotificationKind, type PushOptions, type PushPayload } from "./delivery";

export interface DueNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  entity_id: string | null;
  payload: PushPayload;
  fire_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SenderDeps {
  claim: (limit: number) => Promise<DueNotification[]>;
  subscriptionsFor: (userId: string) => Promise<PushSubscriptionRow[]>;
  /** Resolves with the push service's status; rejects with `{ statusCode?, message }` on failure. */
  push: (subscription: PushSubscriptionRow, body: string, options: PushOptions) => Promise<{ statusCode: number }>;
  record: (notificationId: string, subscriptionId: string, status: number | null, error: string | null) => Promise<void>;
  finish: (notificationId: string, outcome: "sent" | "retry" | "failed") => Promise<void>;
}

export interface TickResult {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  /** Notifications with nobody to send to (no live subscription). */
  unreachable: number;
}

export async function sendDue(deps: SenderDeps, opts: { appUrl: string; limit?: number }): Promise<TickResult> {
  const due = await deps.claim(opts.limit ?? 100);
  const result: TickResult = { claimed: due.length, delivered: 0, retried: 0, failed: 0, unreachable: 0 };
  for (const n of due) {
    const subs = await deps.subscriptionsFor(n.user_id);
    if (subs.length === 0) {
      result.unreachable += 1;
      await deps.finish(n.id, "sent");
      continue;
    }
    const body = serialisePayload(n.payload, opts.appUrl);
    const options = pushOptions(n.kind, n.entity_id, n.fire_at);
    let delivered = 0;
    let retryable = 0;
    for (const sub of subs) {
      const answer = await attempt(deps, sub, body, options);
      await deps.record(n.id, sub.id, answer.status, answer.error);
      const verdict = classifyStatus(answer.status);
      if (verdict === "delivered") delivered += 1;
      else if (verdict === "retry") retryable += 1;
    }
    if (delivered > 0) {
      result.delivered += 1;
      await deps.finish(n.id, "sent");
    } else if (retryable > 0) {
      result.retried += 1;
      await deps.finish(n.id, "retry");
    } else {
      result.failed += 1;
      await deps.finish(n.id, "failed");
    }
  }
  return result;
}

async function attempt(deps: SenderDeps, sub: PushSubscriptionRow, body: string, options: PushOptions): Promise<{ status: number | null; error: string | null }> {
  try {
    const r = await deps.push(sub, body, options);
    return { status: r.statusCode, error: null };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    return { status: typeof err.statusCode === "number" ? err.statusCode : null, error: (err.message ?? String(e)).slice(0, 500) };
  }
}
