// Settings › Connected apps (DECISIONS.md, amendment 2026-10-23): the apps the person has let in through the OAuth
// server, what each may do, a switch between read and change and read only, and Disconnect, which revokes the
// grant at the auth server (its tokens stop working at once) and forgets the choice. The person's cookie session
// only: an app's own token never reaches this route, and Postgres refuses it app_connections writes anyway.
import { NextResponse } from "next/server";
import { sameOrigin } from "@/server/auth/same-origin";
import { createUserScopedClient } from "@/server/auth/supabase";
import { resourceUrl } from "@/server/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConnectedApp {
  clientId: string;
  name: string;
  access: "read" | "write";
  connectedAt: string | null;
}

async function signedIn() {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET(req: Request) {
  const who = await signedIn();
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [{ data: grants, error }, { data: rows }] = await Promise.all([who.supabase.auth.oauth.listGrants(), who.supabase.from("app_connections").select("client_id, client_name, access, created_at")]);
  const byClient = new Map((rows ?? []).map((r) => [r.client_id as string, r]));
  // A grant without a row reads as read only (src/server/mcp/auth.ts and private.app_may_write agree).
  const apps: ConnectedApp[] = (error ? [] : (grants ?? [])).map((g) => {
    const row = byClient.get(g.client.id);
    return { clientId: g.client.id, name: g.client.name || row?.client_name || "An app", access: row?.access === "write" ? "write" : "read", connectedAt: g.granted_at ?? row?.created_at ?? null };
  });
  return NextResponse.json({ apps, endpoint: resourceUrl(new URL(req.url).origin), available: !error });
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const who = await signedIn();
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { clientId?: unknown; access?: unknown } | null;
  const clientId = typeof body?.clientId === "string" && body.clientId.length <= 200 ? body.clientId : null;
  const access = body?.access === "read" || body?.access === "write" ? body.access : null;
  if (!clientId || !access) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data: grants } = await who.supabase.auth.oauth.listGrants();
  const grant = (grants ?? []).find((g) => g.client.id === clientId);
  if (!grant) return NextResponse.json({ error: "not_connected" }, { status: 404 });
  const { error } = await who.supabase
    .from("app_connections")
    .upsert({ user_id: who.user.id, client_id: clientId, client_name: grant.client.name || null, access }, { onConflict: "user_id,client_id" });
  if (error) {
    console.error("app connection update failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  return NextResponse.json({ clientId, access });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const who = await signedIn();
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId || clientId.length > 200) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { error } = await who.supabase.auth.oauth.revokeGrant({ clientId });
  if (error) {
    console.error("app grant revoke failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  await who.supabase.from("app_connections").delete().eq("client_id", clientId);
  return NextResponse.json({ clientId, disconnected: true });
}
