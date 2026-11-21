// Which calendars this server can connect; the Settings panel and the first
// run ask before offering a button. Outlook is offered only where its app
// registration is in the environment (DECISIONS.md, amendment 2026-11-15).
import { NextResponse } from "next/server";
import { requestUser } from "@/server/auth/request-user";
import { googleConfigured, microsoftConfigured } from "@/server/calendar/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { user } = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ google: googleConfigured(), microsoft: microsoftConfigured() }, { headers: { "cache-control": "no-store" } });
}
