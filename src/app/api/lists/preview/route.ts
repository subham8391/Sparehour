// A list item's link preview (DECISIONS.md, amendment 2026-10-22): the device asks once it has saved a link, and the
// title and picture come back to it through sync. The waiting, the fetch and the server-owned write are
// refreshPreview's (src/server/lists/refresh.ts), shared with the MCP server's list tools.
import { NextResponse } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { refreshPreview } from "@/server/lists/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { itemId?: unknown; url?: unknown } | null;
  const itemId = typeof body?.itemId === "string" && UUID.test(body.itemId) ? body.itemId : null;
  const url = typeof body?.url === "string" && body.url.length <= 2048 ? body.url : null;
  if (!itemId || !url) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await refreshPreview(supabase, itemId, url);
  if (result.status === "not_yet") return NextResponse.json({ error: "not_yet" }, { status: 409 });
  if (result.status === "error") return NextResponse.json({ error: "server" }, { status: 500 });
  return NextResponse.json({ title: result.title, image: result.image });
}
