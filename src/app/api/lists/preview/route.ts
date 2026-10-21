// A list item's link preview (DECISIONS.md, amendment 2026-10-22): the device asks once it has saved a link, and the
// title and picture come back to it through sync. The item is read as the person (RLS says whether it is theirs);
// the person's write may still be on its way up, so the link they sent is waited for, briefly, before anything is
// fetched. The preview columns are the server's (list_items_guard), written only while the link is still that one.
import { NextResponse } from "next/server";
import { createUserScopedClient, serviceRoleClient } from "@/server/auth/supabase";
import { fetchPreview } from "@/server/lists/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long the person's own write of the link is waited for: the device uploads it within a beat when online. */
const WAIT = { tries: 8, ms: 750 };

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

  let found = false;
  for (let i = 0; i < WAIT.tries; i++) {
    const { data } = await supabase.from("list_items").select("url").eq("id", itemId).is("deleted_at", null).maybeSingle();
    if (data?.url === url) {
      found = true;
      break;
    }
    await new Promise((r) => setTimeout(r, WAIT.ms));
  }
  if (!found) return NextResponse.json({ error: "not_yet" }, { status: 409 });

  const preview = await fetchPreview(url);
  const { error } = await serviceRoleClient()
    .from("list_items")
    .update({ preview_title: preview?.title ?? null, preview_image: preview?.image ?? null, preview_fetched_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("url", url);
  if (error) {
    console.error("link preview write failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  return NextResponse.json({ title: preview?.title ?? null, image: preview?.image ?? null });
}
