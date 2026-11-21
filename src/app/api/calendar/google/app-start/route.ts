// The phone app starts a Google consent (server/calendar/app-connect.ts, step 1). The web's start is a page the
// browser is sent to with its cookie; the app has none, so it asks with its sign-in token and is told the address
// to open in the system browser. What is asked of Google is exactly what the web asks for the same purpose.
import { answer, appCaller, jsonBody, signAppState, unauthenticated } from "@/server/calendar/app-connect";
import { googleConfigured, googleOAuth } from "@/server/calendar/config";
import { consentPurpose, googleScopesFor } from "@/server/calendar/connect";
import { SCOPES, authorizationUrl } from "@/server/calendar/google";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  const oauth = googleOAuth();
  if (!oauth || !googleConfigured()) return answer({ error: "unavailable" }, 503);
  const purpose = consentPurpose((await jsonBody(request)).purpose);
  const { state } = signAppState(caller.id, purpose, "google");
  return answer({ url: authorizationUrl(oauth, [...SCOPES.identity, ...googleScopesFor(purpose)], state, caller.email) });
}
