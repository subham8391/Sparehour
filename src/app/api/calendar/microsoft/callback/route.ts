// Microsoft sends the person back here (SYSTEM_DESIGN.md §6.2, §6.8), and the
// steps are the Google callback's: the state is checked against the session,
// the code becomes tokens, the tokens are sealed into the account row with the
// same key, and the first sync runs after the redirect has been sent. There is
// one consent and it reads only, so the outcomes are fewer: connected, a no,
// or an error with its reason. Not there at all (404) without an app registration.
import { after, NextResponse, type NextRequest } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { CURRENT_KEY_VERSION, sealToBase64 } from "@/server/calendar/crypto";
import { microsoftConfigured, microsoftOAuth, stateSecret, tokenKey } from "@/server/calendar/config";
import { exchangeCode } from "@/server/calendar/microsoft";
import { buildDeps, syncAccountById } from "@/server/calendar/run";
import { pkceFor, verifyState } from "@/server/calendar/state";

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
  const oauth = microsoftOAuth();
  if (!oauth || !microsoftConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(request.url);
  const verified = verifyState(url.searchParams.get("state"), stateSecret());
  // A state signed for Google's consent is not one of ours.
  const state = verified?.provider === "microsoft" ? verified : null;
  const next = state?.next ?? "/settings";
  if (!state) return back(url.origin, next, "error", "That connection attempt has expired. Try again.");

  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return back(url.origin, next, "error", "Sign in first, then connect the calendar.");

  const refused = url.searchParams.get("error");
  // `access_denied` is the person's no (or their organisation's, when it does not let people approve apps themselves).
  if (refused === "access_denied") return back(url.origin, next, "denied", refused);
  if (refused) return back(url.origin, next, "error", "Microsoft didn't finish the sign-in. Try again.");
  const code = url.searchParams.get("code");
  if (!code) return back(url.origin, next, "error", "Microsoft did not send a code back.");

  try {
    const grant = await exchangeCode(oauth, code, pkceFor(state.nonce, stateSecret()).verifier);
    if (!grant.sub) return back(url.origin, next, "error", "Microsoft did not say which account this is.");
    const key = tokenKey();
    const deps = buildDeps();
    const accountId = await deps.store.connect({
      userId: user.id,
      provider: "microsoft",
      external: grant.sub,
      email: grant.email,
      refreshB64: grant.refreshToken ? sealToBase64(grant.refreshToken, key) : null,
      accessB64: sealToBase64(grant.accessToken, key),
      expiresAt: grant.expiresAt,
      scopes: grant.scopes,
      keyVersion: CURRENT_KEY_VERSION,
    });
    // A reconnect starts each calendar's window afresh rather than from a delta link that may have lapsed with the grant.
    await deps.store.resetSyncTokens(accountId);
    after(async () => {
      try {
        await syncAccountById(accountId, deps);
      } catch (e) {
        console.error("first calendar sync failed", e);
      }
    });
    // Microsoft's consent is one yes or no for everything asked: there is no half-granted outcome to report.
    return back(url.origin, next, "connected");
  } catch (e) {
    console.error("outlook calendar connect failed", e);
    return back(url.origin, next, "error", "Outlook didn't answer. Try again.");
  }
}
