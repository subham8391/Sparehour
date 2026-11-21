// Settings › Connected apps (DECISIONS.md, amendment 2026-10-23): the apps the person has let in through the OAuth
// server, what each may do, a switch between read and change and read only, and Disconnect, which revokes the
// grant at the auth server (its tokens stop working at once) and forgets the choice. The person's own session only
// (the browser's cookie, or the phone app's access token; server/auth/request-user.ts): an app's own token never
// reaches this route, and Postgres refuses it app_connections writes anyway.
import { NextResponse } from "next/server";
import { listGrants, revokeGrant } from "@/server/auth/oauth-grants";
import { bearerToken, requestUser } from "@/server/auth/request-user";
import { sameOrigin } from "@/server/auth/same-origin";
import { resourceUrl } from "@/server/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConnectedApp {
  clientId: string;
  name: string;
  access: "read" | "write";
  connectedAt: string | null;
}

/** The caller, with the bearer token the grants are asked with when the phone app calls (null for the cookie session). */
async function signedIn(req: Request) {
  const { supabase, user } = await requestUser(req);
  return user ? { supabase, user, token: bearerToken(req.headers.get("authorization")) } : null;
}

export async function GET(req: Request) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [{ data: grants, error }, { data: rows }] = await Promise.all([listGrants(who.supabase, who.token), who.supabase.from("app_connections").select("client_id, client_name, access, created_at")]);
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
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { clientId?: unknown; access?: unknown } | null;
  const clientId = typeof body?.clientId === "string" && body.clientId.length <= 200 ? body.clientId : null;
  const access = body?.access === "read" || body?.access === "write" ? body.access : null;
  if (!clientId || !access) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data: grants } = await listGrants(who.supabase, who.token);
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
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId || clientId.length > 200) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { error } = await revokeGrant(who.supabase, who.token, clientId);
  if (error) {
    console.error("app grant revoke failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  await who.supabase.from("app_connections").delete().eq("client_id", clientId);
  return NextResponse.json({ clientId, disconnected: true });
}
