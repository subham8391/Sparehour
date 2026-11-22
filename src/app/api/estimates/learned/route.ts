// How a person's estimates run (DECISIONS.md, amendment 2026-11-15): the newest finished tasks with a recorded
// length, read as the signed-in person (the tables' read policies hold) and answered as what core/estimates learned
// from them. The app asks now and then and keeps the answer on the device, so a suggestion never waits on this.
import { NextResponse } from "next/server";
import { requestUser } from "@/server/auth/request-user";
import { readLearned, spaceParam } from "@/server/estimates/learned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { supabase, user } = await requestUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const space = spaceParam(new URL(req.url).searchParams);
  if (space === undefined) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const learned = await readLearned(supabase, space);
    return NextResponse.json({ learned }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("learned estimates failed", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
