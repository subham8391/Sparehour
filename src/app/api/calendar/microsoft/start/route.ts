// Start the Outlook / Microsoft 365 consent (SYSTEM_DESIGN.md §6.8; DECISIONS.md,
// amendment 2026-11-15): who it is, a refresh token, and the narrowest calendar
// permission Graph has, nothing more. The shape is Google's (the signed state,
// `next`, the login redirect), with one difference: where this server has no
// Microsoft app registration the route is not there at all, a plain 404.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/features/auth/safe-next";
import { createUserScopedClient } from "@/server/auth/supabase";
import { microsoftConfigured, microsoftOAuth, stateSecret } from "@/server/calendar/config";
import { CONNECT_SCOPES, authorizationUrl } from "@/server/calendar/microsoft";
import { STATE_TTL_SECONDS, pkceFor, signState } from "@/server/calendar/state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const oauth = microsoftOAuth();
  if (!oauth || !microsoftConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") ?? "/settings");
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url.origin));

  const nonce = randomUUID();
  const state = signState({ userId: user.id, purpose: "read", provider: "microsoft", next, nonce, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS }, stateSecret());
  return NextResponse.redirect(authorizationUrl(oauth, CONNECT_SCOPES, state, pkceFor(nonce, stateSecret()).challenge));
}
