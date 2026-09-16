// Google's push notification (SYSTEM_DESIGN.md §6.4): no event data, just
// "something changed on this channel". The token is checked against what we
// stored for the channel; a bad one is a 404. The first message on a new
// channel is `sync` and is acknowledged only. Anything else asks for a sync
// and runs it after answering — Google wants its 200 within seconds.
import { after, NextResponse, type NextRequest } from "next/server";
import { serviceRoleClient } from "@/server/auth/supabase";
import { googleConfigured, isUuid } from "@/server/calendar/config";
import { buildDeps, syncAccountById } from "@/server/calendar/run";
import { SupabaseAccountStore } from "@/server/calendar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");
  const state = req.headers.get("x-goog-resource-state");
  if (!isUuid(channelId) || !token || token.length > 256) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const store = new SupabaseAccountStore(serviceRoleClient());
  const accountId = await store.channelAccount(channelId, token);
  if (!accountId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (state === "sync") return NextResponse.json({ ok: true });
  await store.requestSync(accountId);
  if (googleConfigured()) {
    after(async () => {
      try {
        await syncAccountById(accountId, buildDeps(store));
      } catch (e) {
        console.error("webhook sync failed", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
