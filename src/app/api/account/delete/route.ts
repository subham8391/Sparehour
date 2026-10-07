// Delete account (SYSTEM_DESIGN.md §9.6; ruled 2026-10-06): mark the account,
// let every calendar go at once, end every session. The data stays 30 days, in
// case the person signs back in and restores it; then a nightly job removes it.
// The page that asked clears its own device afterwards, as signing out does.
import { NextResponse, type NextRequest } from "next/server";
import { createUserScopedClient, serviceRoleClient } from "@/server/auth/supabase";
import { liveTeardown, tearDownCalendars } from "@/server/account/delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // A JSON body that says so: a form posted from elsewhere can send neither.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ error: "bad_request" }, { status: 415 });
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (typeof body?.confirm !== "string" || body.confirm.trim().toLowerCase() !== "delete") return NextResponse.json({ error: "confirm_required" }, { status: 400 });

  const admin = serviceRoleClient();
  const { data: after, error } = await admin.rpc("account_delete_request", { p_user: user.id });
  if (error || !after) {
    console.error("account_delete_request failed", error?.message);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  try {
    await tearDownCalendars(user.id, liveTeardown(admin));
  } catch (e) {
    // The account is marked either way; the nightly job drops whatever tokens are left with it.
    console.warn("calendar teardown incomplete", e instanceof Error ? e.message : e);
  }
  // Every device's session ends now; this response also clears this browser's cookie.
  await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  return NextResponse.json({ delete_after: after }, { headers: { "cache-control": "no-store" } });
}
