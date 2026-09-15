// Whether this server can connect Google Calendar at all; the Settings panel
// asks before offering the button.
import { NextResponse } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { googleConfigured } from "@/server/calendar/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ google: googleConfigured() }, { headers: { "cache-control": "no-store" } });
}
