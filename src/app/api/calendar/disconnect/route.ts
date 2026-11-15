// Disconnect (SYSTEM_DESIGN.md §6.2): drop the tokens, keep the mirror seven
// days, and hand the grant back where the provider has a way to. Google has a
// revoke endpoint. Microsoft has none for one app's grant (§6.8), so for an
// Outlook account forgetting the tokens is the whole of it; a token is never
// sent to a provider it did not come from. Blocks stay local and are marked
// unsynced by the account row going away.
import { NextResponse, type NextRequest } from "next/server";
import { serviceRoleClient, createUserScopedClient } from "@/server/auth/supabase";
import { openFromBase64 } from "@/server/calendar/crypto";
import { isUuid, tokenKey } from "@/server/calendar/config";
import { revokeToken } from "@/server/calendar/google";
import { SupabaseAccountStore } from "@/server/calendar/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!isUuid(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const store = new SupabaseAccountStore(serviceRoleClient());
  // Read first: the connection row that says whose account it is goes with the disconnect.
  const provider = await store.providerOf(body.id, user.id);
  const sealed = await store.disconnect(body.id, user.id);
  if (sealed === null) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    if (sealed && provider === "google") await revokeToken(openFromBase64(sealed, tokenKey()));
  } catch (e) {
    console.warn("token revoke skipped", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
