// GET /api/bootstrap (SYSTEM_DESIGN.md §4.7 "Version gating", §10.2): what a
// starting client needs from the server before it trusts its own build —
// the oldest build allowed (min_client_version, from private.app_config
// through public.min_client_version(); null when there is no gate) and the
// server's clock. Feature flags join it when they exist (§13). Readable signed
// in or not; an unreachable database reports no gate, so a hiccup never blocks
// anyone.
import { NextResponse } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let min: string | null = null;
  try {
    const supabase = await createUserScopedClient();
    const { data, error } = await supabase.rpc("min_client_version");
    if (error) console.warn("min_client_version unreadable", error.message);
    else if (typeof data === "string" && data.trim()) min = data.trim().slice(0, 64);
  } catch (e) {
    console.warn("min_client_version unreadable", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ min_client_version: min, server_time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
