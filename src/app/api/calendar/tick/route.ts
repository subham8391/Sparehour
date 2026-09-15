// The hourly reconcile (SYSTEM_DESIGN.md §6.4): pg_cron calls this through
// pg_net with the jobs secret; a few due accounts are claimed and synced.
// Push is an optimisation; this is the source of truth.
import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, jobSecret } from "@/server/calendar/config";
import { pushDue, syncDue } from "@/server/calendar/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = jobSecret();
  if (!secret || req.headers.get("x-push-secret") !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!googleConfigured()) return NextResponse.json({ skipped: "calendar_not_configured" });
  try {
    const report = await syncDue(10);
    const push = await pushDue();
    return NextResponse.json({ accounts: Object.keys(report).length, report, push });
  } catch (e) {
    console.error("calendar tick failed", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
