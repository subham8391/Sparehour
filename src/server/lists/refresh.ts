// Writing a list item's link preview (DECISIONS.md, amendment 2026-10-22): the item is read as the person (RLS says
// whether it is theirs), their write of the link may still be on its way up, so that link is waited for, briefly,
// before anything is fetched. The preview columns are the server's (list_items_guard), written with the service role
// only while the item still has that link. The preview route and the MCP server's list tools both end here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "@/server/auth/supabase";
import { fetchPreview } from "./preview";

export type RefreshResult = { status: "ok"; title: string | null; image: string | null } | { status: "not_yet" } | { status: "error" };

/** How long the person's own write of the link is waited for: a device uploads it within a beat when online. */
export const PREVIEW_WAIT = { tries: 8, ms: 750 };

export async function refreshPreview(asPerson: SupabaseClient, itemId: string, url: string, wait: { tries: number; ms: number } = PREVIEW_WAIT): Promise<RefreshResult> {
  let found = false;
  for (let i = 0; i < wait.tries; i++) {
    const { data } = await asPerson.from("list_items").select("url").eq("id", itemId).is("deleted_at", null).maybeSingle();
    if (data?.url === url) {
      found = true;
      break;
    }
    if (i < wait.tries - 1) await new Promise((r) => setTimeout(r, wait.ms));
  }
  if (!found) return { status: "not_yet" };

  const preview = await fetchPreview(url);
  const { error } = await serviceRoleClient()
    .from("list_items")
    .update({ preview_title: preview?.title ?? null, preview_image: preview?.image ?? null, preview_fetched_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("url", url);
  if (error) {
    console.error("link preview write failed", error);
    return { status: "error" };
  }
  return { status: "ok", title: preview?.title ?? null, image: preview?.image ?? null };
}
