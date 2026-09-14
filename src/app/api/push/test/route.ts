// "Send a test" (SCREENS.md §18): one notification to every device this
// account has, sent as the signed-in user so RLS scopes the subscriptions.
import { NextResponse } from "next/server";
import webPush from "web-push";
import { createUserScopedClient } from "@/server/auth/supabase";
import { classifyStatus, serialisePayload, type PushPayload } from "@/server/push/delivery";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicKey || !privateKey || !subject || !appUrl) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  webPush.setVapidDetails(subject, publicKey, privateKey);

  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").is("deleted_at", null);
  if (error) return NextResponse.json({ error: "server" }, { status: 500 });

  const payload: PushPayload = {
    web_push: 8030,
    notification: { title: "Sparehour reminders are on.", body: "This is what a reminder looks like here.", navigate: "/settings?src=test", lang: "en-GB", silent: false },
    sh: { kind: "morning", actions: [] },
  };
  const body = serialisePayload(payload, appUrl);
  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    let status: number | null = null;
    try {
      status = (await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60, urgency: "high", topic: "test" })).statusCode;
    } catch (e) {
      status = typeof (e as { statusCode?: number }).statusCode === "number" ? (e as { statusCode: number }).statusCode : null;
    }
    const verdict = classifyStatus(status);
    if (verdict === "delivered") sent += 1;
    else failed += 1;
    if (verdict === "gone") await supabase.from("push_subscriptions").update({ deleted_at: new Date().toISOString() }).eq("id", sub.id);
  }
  return NextResponse.json({ sent, failed });
}
