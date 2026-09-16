// The minute tick (SYSTEM_DESIGN.md §7.4): claims what is due and sends it
// with web-push. Called by pg_cron through pg_net, or by any scheduler, with
// the shared secret; never by a browser.
import { NextResponse, type NextRequest } from "next/server";
import webPush from "web-push";
import { serviceRoleClient } from "@/server/auth/supabase";
import { secretMatches } from "@/server/calendar/config";
import { sendDue, type DueNotification, type PushSubscriptionRow, type SenderDeps } from "@/server/push/sender";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_TICK_SECRET;
  if (!secretMatches(req.headers.get("x-push-secret"), secret)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicKey || !privateKey || !subject || !appUrl) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  webPush.setVapidDetails(subject, publicKey, privateKey);

  const db = serviceRoleClient();
  const deps: SenderDeps = {
    claim: async (limit) => {
      const { data, error } = await db.rpc("claim_due_notifications", { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as DueNotification[];
    },
    subscriptionsFor: async (userId) => {
      const { data, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as PushSubscriptionRow[];
    },
    push: (sub, body, options) => webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: options.TTL, urgency: options.urgency, topic: options.topic }),
    record: async (notificationId, subscriptionId, status, error) => {
      await db.rpc("record_notification_delivery", { p_notification: notificationId, p_subscription: subscriptionId, p_status: status, p_error: error });
    },
    finish: async (notificationId, outcome) => {
      await db.rpc("finish_notification", { p_id: notificationId, p_outcome: outcome });
    },
  };

  try {
    const result = await sendDue(deps, { appUrl });
    return NextResponse.json(result);
  } catch (e) {
    console.error("push tick failed", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
