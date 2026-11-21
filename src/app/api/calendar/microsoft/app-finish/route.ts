// The phone app finishes an Outlook consent (server/calendar/app-connect.ts, step 3): the ticket the callback
// sealed, with the app's sign-in token. Only the person the ticket's state names gets any further; the code is then
// exchanged with the verifier that belongs to that state and saved as a read-only Outlook account, by the function
// the web's callback uses. Not there at all (404) without a Microsoft app registration.
import { answer, appCaller, claimTicket, jsonBody, unauthenticated } from "@/server/calendar/app-connect";
import { microsoftConfigured, microsoftOAuth } from "@/server/calendar/config";
import { connectMicrosoft } from "@/server/calendar/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const oauth = microsoftOAuth();
  if (!oauth || !microsoftConfigured()) return answer({ error: "not_found" }, 404);
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  const claim = claimTicket((await jsonBody(request)).ticket, "microsoft", caller.id);
  if (!claim.ok) return answer({ error: claim.error }, claim.status);
  const result = await connectMicrosoft({ userId: caller.id, nonce: claim.state.nonce, code: claim.code, oauth });
  return result.ok ? answer({ outcome: result.outcome }) : answer({ error: "provider", reason: result.reason }, 502);
}
