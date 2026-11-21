// The phone app starts an Outlook consent (server/calendar/app-connect.ts, step 1). As on the web there is one
// thing to ask Microsoft for, reading, whatever the app sends as a purpose: nothing is ever written to Outlook
// (DECISIONS.md, amendment 2026-11-15). Not there at all (404) where this server has no Microsoft app registration.
import { answer, appCaller, signAppState, unauthenticated } from "@/server/calendar/app-connect";
import { microsoftConfigured, microsoftOAuth, stateSecret } from "@/server/calendar/config";
import { CONNECT_SCOPES, authorizationUrl } from "@/server/calendar/microsoft";
import { pkceFor } from "@/server/calendar/state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const oauth = microsoftOAuth();
  if (!oauth || !microsoftConfigured()) return answer({ error: "not_found" }, 404);
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  const { state, nonce } = signAppState(caller.id, "read", "microsoft");
  return answer({ url: authorizationUrl(oauth, CONNECT_SCOPES, state, pkceFor(nonce, stateSecret()).challenge) });
}
