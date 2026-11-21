// A provider's code becomes a connected account (SYSTEM_DESIGN.md §6.1–§6.2, §6.8): the code is exchanged for
// tokens, the tokens are sealed into the account row, and the first sync runs after the answer has been sent. One
// place for it, because two routes end here: the web's callback, which knows the person by their cookie, and the
// phone app's `app-finish`, which knows them by their sign-in token (app-connect.ts). Whoever calls has already
// settled who the account is for; nothing here decides that.
import { after } from "next/server";
import { tokenKey, stateSecret } from "./config";
import { CURRENT_KEY_VERSION, sealToBase64 } from "./crypto";
import { APP_CREATED_SCOPE, EVENTS_OWNED_SCOPE, EVENTS_READ_SCOPE, FREEBUSY_SCOPE, SCOPES, exchangeCode as exchangeGoogleCode, type GoogleOAuthConfig, type TokenGrant } from "./google";
import { exchangeCode as exchangeMicrosoftCode, type MicrosoftOAuthConfig } from "./microsoft";
import type { ProviderId } from "./provider";
import { buildDeps, syncAccountById } from "./run";
import { pkceFor, type ConsentPurpose } from "./state";

/** What was asked for, from a query or a body: anything that is not "write" or "full" is the plain connect. */
export const consentPurpose = (asked: unknown): ConsentPurpose => (asked === "write" || asked === "full" ? asked : "read");

/** Google's scopes for a purpose, beside who it is (DECISIONS.md, amendment 2026-10-21): only "full" has the sensitive ones. */
export function googleScopesFor(purpose: ConsentPurpose): readonly string[] {
  if (purpose === "full") return [...SCOPES.read, ...SCOPES.writeOwned];
  return purpose === "write" ? [...SCOPES.busy, ...SCOPES.writeAppCreated] : SCOPES.busy;
}

/** What came of a Google consent that was exchanged: the words the web's Settings and first run read from `?calendar=`. */
export type GoogleOutcome = "connected" | "read_only" | "no_read" | "full" | "full_denied";

/** `reason` is one plain line for the person, never the provider's own text. */
export type ConnectResult<Outcome extends string> = { ok: true; outcome: Outcome } | { ok: false; reason: string };

/** Seals the grant into the person's account row and queues its first sync for after the answer. */
async function saveAccount(userId: string, provider: ProviderId, external: string, grant: TokenGrant): Promise<void> {
  const key = tokenKey();
  const deps = buildDeps();
  const accountId = await deps.store.connect({
    userId,
    provider,
    external,
    email: grant.email,
    refreshB64: grant.refreshToken ? sealToBase64(grant.refreshToken, key) : null,
    accessB64: sealToBase64(grant.accessToken, key),
    expiresAt: grant.expiresAt,
    scopes: grant.scopes,
    keyVersion: CURRENT_KEY_VERSION,
  });
  // What the provider returns may have changed with this grant (Google: busy times only → titles), and a reconnect
  // must not start from a sync token that lapsed with the old grant: the first pass reads it all.
  await deps.store.resetSyncTokens(accountId);
  after(async () => {
    try {
      await syncAccountById(accountId, deps);
    } catch (e) {
      console.error("first calendar sync failed", e);
    }
  });
}

export async function connectGoogle(input: { userId: string; purpose: ConsentPurpose; code: string; oauth: GoogleOAuthConfig }): Promise<ConnectResult<GoogleOutcome>> {
  try {
    const grant = await exchangeGoogleCode(input.oauth, input.code);
    if (!grant.sub) return { ok: false, reason: "Google did not say which account this is." };
    await saveAccount(input.userId, "google", grant.sub, grant);
    const granted = new Set(grant.scopes);
    const canRead = granted.has(FREEBUSY_SCOPE) || granted.has(EVENTS_READ_SCOPE);
    const canWrite = granted.has(EVENTS_OWNED_SCOPE) || granted.has(APP_CREATED_SCOPE);
    // Google lets a person untick what they are asked for: say what came of it.
    if (!canRead) return { ok: true, outcome: "no_read" };
    if (input.purpose === "full") return { ok: true, outcome: granted.has(EVENTS_READ_SCOPE) ? "full" : "full_denied" };
    // ONBOARDING.md step 2: read granted but write declined → say so; the picker stays hidden.
    return { ok: true, outcome: input.purpose === "write" && !canWrite ? "read_only" : "connected" };
  } catch (e) {
    console.error("google calendar connect failed", e);
    return { ok: false, reason: "Google didn't answer. Try again." };
  }
}

/**
 * Outlook's is one consent, read only, so there is one outcome. `nonce` is the verified state's: the PKCE verifier
 * is worked out from it again (state.ts), so a code is only redeemed with the state its consent was started with.
 */
export async function connectMicrosoft(input: { userId: string; nonce: string; code: string; oauth: MicrosoftOAuthConfig }): Promise<ConnectResult<"connected">> {
  try {
    const grant = await exchangeMicrosoftCode(input.oauth, input.code, pkceFor(input.nonce, stateSecret()).verifier);
    if (!grant.sub) return { ok: false, reason: "Microsoft did not say which account this is." };
    await saveAccount(input.userId, "microsoft", grant.sub, grant);
    // Microsoft's consent is one yes or no for everything asked: there is no half-granted outcome to report.
    return { ok: true, outcome: "connected" };
  } catch (e) {
    console.error("outlook calendar connect failed", e);
    return { ok: false, reason: "Outlook didn't answer. Try again." };
  }
}
