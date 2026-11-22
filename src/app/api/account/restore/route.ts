// Restore an account waiting for deletion (SYSTEM_DESIGN.md §9.6): signing in
// during the 30 days lands on /account/deleted (the web) or the app's own
// "will be deleted" screen (mobile/src/screens/account-deleted.tsx), whose
// Restore calls this. The data never left; sync starts again on the next load.
// A calendar that was connected has to be connected again — its grant was
// revoked at deletion. The caller is the browser's cookie or the phone's
// bearer token (server/auth/request-user.ts).
import { NextResponse } from "next/server";
import { deleteAfter } from "@/features/account/deletion";
import { requestUser } from "@/server/auth/request-user";
import { serviceRoleClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { supabase, user } = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!deleteAfter(user.app_metadata)) return NextResponse.json({ restored: false });
  const { error } = await serviceRoleClient().rpc("account_restore", { p_user: user.id });
  if (error) {
    console.error("account_restore failed", error.message);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  // The session's own claims still carry the mark until it refreshes; refresh the browser's now so nothing reads it
  // stale. The phone refreshes its own session once this answers.
  if (!request.headers.get("authorization")) await supabase.auth.refreshSession().catch(() => undefined);
  return NextResponse.json({ restored: true }, { headers: { "cache-control": "no-store" } });
}
