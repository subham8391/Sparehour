// Older finished tasks (DECISIONS.md, amendment 2026-11-14): a device syncs a week of the Logbook, and what was
// finished before that is kept on the server in `finished_tasks`. This reads a page of them, newest first, for the
// Logbook's "Show older", search and the export, as the signed-in person (the read policy and the function's own
// membership check hold). `available: false` when the database has not got the table yet.
import { NextResponse } from "next/server";
import { requestUser } from "@/server/auth/request-user";
import { notThere, olderArgs, pageSize } from "@/server/logbook/older";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { supabase, user } = await requestUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const args = olderArgs(params);
  if (!args) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data, error } = await supabase.rpc("finished_tasks_page", args);
  if (error) {
    if (notThere(error)) return NextResponse.json({ available: false, rows: [], more: false });
    console.error("older finished tasks failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  const rows = (data ?? []) as unknown[];
  const size = pageSize(params);
  return NextResponse.json({ available: true, rows: rows.slice(0, size), more: rows.length > size }, { headers: { "Cache-Control": "private, no-store" } });
}
