// "Sync now" (PRODUCT_SPEC.md §10.1) and the app coming back to the
// foreground after a while (SYSTEM_DESIGN.md §6.4): every account of the
// signed-in person, now, whether or not the hourly reconcile thinks it is due.
import { NextResponse } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { calendarConfigured, googleConfigured } from "@/server/calendar/config";
import { pushUser, syncUser } from "@/server/calendar/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!calendarConfigured()) return NextResponse.json({ error: "calendar_not_configured" }, { status: 503 });
  try {
    const report = await syncUser(user.id);
    // Blocks are written to Google only; a server that connects Outlook alone has nothing to push.
    const push = googleConfigured() ? await pushUser(user.id) : { written: 0, deleted: 0, adopted: 0, failed: 0 };
    return NextResponse.json({ accounts: Object.keys(report).length, report, push });
  } catch (e) {
    console.error("calendar sync failed", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
