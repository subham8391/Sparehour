// Restore an account waiting for deletion (SYSTEM_DESIGN.md §9.6): signing in
// during the 30 days lands on /account/deleted, whose Restore calls this. The
// data never left; sync starts again on the next load. A calendar that was
// connected has to be connected again — its grant was revoked at deletion.
import { NextResponse } from "next/server";
import { deleteAfter } from "@/features/account/deletion";
import { createUserScopedClient, serviceRoleClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!deleteAfter(user.app_metadata)) return NextResponse.json({ restored: false });
  const { error } = await serviceRoleClient().rpc("account_restore", { p_user: user.id });
  if (error) {
    console.error("account_restore failed", error.message);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  // The session's own claims still carry the mark until it refreshes; refresh it now so nothing reads it stale.
  await supabase.auth.refreshSession().catch(() => undefined);
  return NextResponse.json({ restored: true }, { headers: { "cache-control": "no-store" } });
}
