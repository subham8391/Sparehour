// The sync token (SYSTEM_DESIGN.md §9.2): five minutes, audience "powersync",
// signed with the secret the service also holds. Only a signed-in session
// gets one; the token itself grants nothing but the sync stream.
import { NextResponse } from "next/server";
import { BUILD_ID } from "@/data/build-id";
import { deleteAfter } from "@/features/account/deletion";
import { createUserScopedClient } from "@/server/auth/supabase";
import { secretUsable, signSyncToken } from "@/server/sync/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const secret = process.env.POWERSYNC_JWT_SECRET;
  if (!secretUsable(secret)) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // An account waiting for deletion syncs nothing (SYSTEM_DESIGN.md §9.6: sync stops at once).
  if (deleteAfter(user.app_metadata)) return NextResponse.json({ error: "account_deleted" }, { status: 403 });
  const { token, expiresAt } = signSyncToken({ userId: user.id, secret, appVersion: BUILD_ID });
  return NextResponse.json({ token, expires_at: expiresAt }, { headers: { "cache-control": "no-store" } });
}
