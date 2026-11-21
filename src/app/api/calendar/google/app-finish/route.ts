// The phone app finishes a Google consent (server/calendar/app-connect.ts, step 3): it hands back the ticket the
// callback sealed, with its sign-in token. Only the person the ticket's state names gets any further; then the code
// is exchanged and the account saved by the function the web's callback uses, and the first sync runs after the answer.
import { answer, appCaller, claimTicket, jsonBody, unauthenticated } from "@/server/calendar/app-connect";
import { googleConfigured, googleOAuth } from "@/server/calendar/config";
import { connectGoogle } from "@/server/calendar/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  const oauth = googleOAuth();
  if (!oauth || !googleConfigured()) return answer({ error: "unavailable" }, 503);
  const claim = claimTicket((await jsonBody(request)).ticket, "google", caller.id);
  if (!claim.ok) return answer({ error: claim.error }, claim.status);
  const result = await connectGoogle({ userId: caller.id, purpose: claim.state.purpose, code: claim.code, oauth });
  // The outcome is the web's own word for it (connected, read_only, no_read, full, full_denied).
  return result.ok ? answer({ outcome: result.outcome }) : answer({ error: "provider", reason: result.reason }, 502);
}
