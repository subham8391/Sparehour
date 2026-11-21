// The sync token (SYSTEM_DESIGN.md §9.2): five minutes, audience "powersync",
// signed with the secret the service also holds. Only a signed-in session
// gets one (the browser's cookie, or the phone app's bearer token); the token
// itself grants nothing but the sync stream.
import { NextResponse } from "next/server";
import { BUILD_ID } from "@/data/build-id";
import { deleteAfter } from "@/features/account/deletion";
import { requestUser } from "@/server/auth/request-user";
import { secretUsable, signSyncToken } from "@/server/sync/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.POWERSYNC_JWT_SECRET;
  if (!secretUsable(secret)) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { user } = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // An account waiting for deletion syncs nothing (SYSTEM_DESIGN.md §9.6: sync stops at once).
  if (deleteAfter(user.app_metadata)) return NextResponse.json({ error: "account_deleted" }, { status: 403 });
  const { token, expiresAt } = signSyncToken({ userId: user.id, secret, appVersion: BUILD_ID });
  // Who the token is for goes with it: a device that still holds another account's copy clears it before it syncs
  // (data/powersync/owner.ts).
  return NextResponse.json({ token, expires_at: expiresAt, user_id: user.id }, { headers: { "cache-control": "no-store" } });
}
