// After a block changes (SYSTEM_DESIGN.md §6.5): write what Google is behind
// on for the signed-in person, now, rather than at the next reconcile. Cheap
// when there is nothing to do.
import { NextResponse } from "next/server";
import { requestUser } from "@/server/auth/request-user";
import { googleConfigured } from "@/server/calendar/config";
import { pushUser } from "@/server/calendar/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { user } = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ written: 0, deleted: 0, adopted: 0, failed: 0, skipped: "calendar_not_configured" });
  try {
    return NextResponse.json(await pushUser(user.id));
  } catch (e) {
    console.error("calendar push failed", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
