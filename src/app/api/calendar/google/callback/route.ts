// Google sends the person back here (SYSTEM_DESIGN.md §6.1–§6.2): the state
// is checked against the session, the code becomes tokens, the tokens are
// sealed into the account row, and the first sync runs after the redirect
// has been sent — so the Settings page comes back at once and fills in.
import { after, NextResponse, type NextRequest } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { CURRENT_KEY_VERSION, sealToBase64 } from "@/server/calendar/crypto";
import { googleOAuth, stateSecret, tokenKey } from "@/server/calendar/config";
import { APP_CREATED_SCOPE, EVENTS_OWNED_SCOPE, EVENTS_READ_SCOPE, FREEBUSY_SCOPE, exchangeCode } from "@/server/calendar/google";
import { buildDeps, syncAccountById } from "@/server/calendar/run";
import { verifyState } from "@/server/calendar/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function back(origin: string, next: string, outcome: string, reason?: string): NextResponse {
  const target = new URL(next, origin);
  target.searchParams.set("calendar", outcome);
  if (reason) target.searchParams.set("reason", reason);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = verifyState(url.searchParams.get("state"), stateSecret());
  const next = state?.next ?? "/settings";
  if (!state) return back(url.origin, next, "error", "That connection attempt has expired. Try again.");

  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return back(url.origin, next, "error", "Sign in first, then connect the calendar.");

  const denied = url.searchParams.get("error");
  if (denied) return back(url.origin, next, state.purpose === "write" ? "write_denied" : state.purpose === "full" ? "full_denied" : "denied", denied);
  const code = url.searchParams.get("code");
  const oauth = googleOAuth();
  if (!code || !oauth) return back(url.origin, next, "error", "Google did not send a code back.");

  try {
    const grant = await exchangeCode(oauth, code);
    if (!grant.sub) return back(url.origin, next, "error", "Google did not say which account this is.");
    const key = tokenKey();
    const deps = buildDeps();
    const accountId = await deps.store.connect({
      userId: user.id,
      provider: "google",
      external: grant.sub,
      email: grant.email,
      refreshB64: grant.refreshToken ? sealToBase64(grant.refreshToken, key) : null,
      accessB64: sealToBase64(grant.accessToken, key),
      expiresAt: grant.expiresAt,
      scopes: grant.scopes,
      keyVersion: CURRENT_KEY_VERSION,
    });
    // What Google returns may have changed with this grant (busy times only → titles): the first pass reads it all.
    await deps.store.resetSyncTokens(accountId);
    after(async () => {
      try {
        await syncAccountById(accountId, deps);
      } catch (e) {
        console.error("first calendar sync failed", e);
      }
    });
    const granted = new Set(grant.scopes);
    const canRead = granted.has(FREEBUSY_SCOPE) || granted.has(EVENTS_READ_SCOPE);
    const canWrite = granted.has(EVENTS_OWNED_SCOPE) || granted.has(APP_CREATED_SCOPE);
    // Google lets a person untick what they are asked for: say what came of it.
    if (!canRead) return back(url.origin, next, "no_read");
    if (state.purpose === "full") return back(url.origin, next, granted.has(EVENTS_READ_SCOPE) ? "full" : "full_denied");
    // ONBOARDING.md step 2: read granted but write declined → say so; the picker stays hidden.
    return back(url.origin, next, state.purpose === "write" && !canWrite ? "read_only" : "connected");
  } catch (e) {
    console.error("google calendar connect failed", e);
    return back(url.origin, next, "error", "Google didn't answer. Try again.");
  }
}
