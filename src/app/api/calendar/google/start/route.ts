// Start the Google consent (SYSTEM_DESIGN.md §6.1, as amended 2026-10-21 in
// DECISIONS.md): busy times at connect and the app-created calendar for
// writing, both non-sensitive so Google shows no warning screen; full access
// (`purpose=full`: titles, blocks on the person's own calendars) is the opt-in
// that does. Always incremental, so nothing already granted is asked again.
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

  const asked = url.searchParams.get("purpose");
  const purpose = asked === "write" || asked === "full" ? asked : "read";
  const scopes = [...SCOPES.identity, ...scopesFor(purpose)];
  const state = signState({ userId: user.id, purpose, next, nonce: randomUUID(), exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS }, stateSecret());
  return NextResponse.redirect(authorizationUrl(oauth, scopes, state, user.email));
}

function scopesFor(purpose: "read" | "write" | "full"): readonly string[] {
  if (purpose === "full") return [...SCOPES.read, ...SCOPES.writeOwned];
  return purpose === "write" ? [...SCOPES.busy, ...SCOPES.writeAppCreated] : SCOPES.busy;
}

function withCalendar(next: string, origin: string, outcome: string): URL {
  const target = new URL(next, origin);
  target.searchParams.set("calendar", outcome);
  return target;
}
