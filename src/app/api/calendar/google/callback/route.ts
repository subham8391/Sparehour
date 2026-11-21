// Google sends the person back here (SYSTEM_DESIGN.md §6.1–§6.2): the state
// is checked against the session, the code becomes tokens, the tokens are
// sealed into the account row, and the first sync runs after the redirect
// has been sent — so the Settings page comes back at once and fills in.
// A consent started in the phone app is the one exception: no session says
// who is in that browser, so it is handed back to the app as a sealed ticket
// and nothing is exchanged or saved here (server/calendar/app-connect.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createUserScopedClient } from "@/server/auth/supabase";
import { appReturn } from "@/server/calendar/app-connect";
import { googleOAuth, stateSecret } from "@/server/calendar/config";
import { connectGoogle } from "@/server/calendar/connect";
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
  const url = new URL(request.url);
  const raw = url.searchParams.get("state");
  if (startedInApp(raw, stateSecret())) return appReturn("google", url.searchParams);
  const state = verifyState(raw, stateSecret());
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

  // The exchange, the sealed account row and the first sync are connect.ts's, shared with the app's finish.
  const result = await connectGoogle({ userId: user.id, purpose: state.purpose, code, oauth });
  return result.ok ? back(url.origin, next, result.outcome) : back(url.origin, next, "error", result.reason);
}
