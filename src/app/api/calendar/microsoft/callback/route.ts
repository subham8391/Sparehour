// Microsoft sends the person back here (SYSTEM_DESIGN.md §6.2, §6.8), and the
// steps are the Google callback's: the state is checked against the session,
// the code becomes tokens, the tokens are sealed into the account row with the
// same key, and the first sync runs after the redirect has been sent. There is
// one consent and it reads only, so the outcomes are fewer: connected, a no,
// or an error with its reason. Not there at all (404) without an app registration.
// A consent started in the phone app goes back to the app as a sealed ticket,
// with nothing exchanged or saved here (server/calendar/app-connect.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { appReturn } from "@/server/calendar/app-connect";
import { microsoftConfigured, microsoftOAuth, stateSecret } from "@/server/calendar/config";
import { connectMicrosoft } from "@/server/calendar/connect";
import { startedInApp, verifyState } from "@/server/calendar/state";

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
  const raw = url.searchParams.get("state");
  if (startedInApp(raw, stateSecret())) return appReturn("microsoft", url.searchParams);
  const verified = verifyState(raw, stateSecret());
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

  // The exchange (with the verifier for this state), the sealed account row and the first sync are connect.ts's,
  // shared with the app's finish.
  const result = await connectMicrosoft({ userId: user.id, nonce: state.nonce, code, oauth });
  return result.ok ? back(url.origin, next, result.outcome) : back(url.origin, next, "error", result.reason);
}
