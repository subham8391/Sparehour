// Start the Google consent (SYSTEM_DESIGN.md §6.1): read scopes at connect,
// the write scope later and separately (`purpose=write`), always with
// incremental consent so nothing already granted is asked for again.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/features/auth/safe-next";
import { createUserScopedClient } from "@/server/auth/supabase";
import { googleConfigured, googleOAuth, stateSecret } from "@/server/calendar/config";
import { SCOPES, authorizationUrl } from "@/server/calendar/google";
import { STATE_TTL_SECONDS, signState } from "@/server/calendar/state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") ?? "/settings");
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url.origin));
  const oauth = googleOAuth();
  if (!oauth || !googleConfigured()) return NextResponse.redirect(withCalendar(next, url.origin, "unavailable"));

  const purpose = url.searchParams.get("purpose") === "write" ? "write" : "read";
  const fallback = url.searchParams.get("fallback") === "1"; // the person declined events.owned: ask for the app-created calendar instead
  const scopes = [...SCOPES.identity, ...SCOPES.read, ...(purpose === "write" ? (fallback ? SCOPES.writeAppCreated : SCOPES.writeOwned) : [])];
  const state = signState({ userId: user.id, purpose, next, nonce: randomUUID(), exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS }, stateSecret());
  return NextResponse.redirect(authorizationUrl(oauth, scopes, state, user.email));
}

function withCalendar(next: string, origin: string, outcome: string): URL {
  const target = new URL(next, origin);
  target.searchParams.set("calendar", outcome);
  return target;
}
