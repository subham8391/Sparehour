// Connecting a calendar from the phone app, which has no cookie (DECISIONS.md, amendment 2026-11-21 "a real Android
// app"; the web's flow is /api/calendar/<provider>/start → callback). Three steps, and who the person is gets proved
// at the first and the last, never in the browser between them:
//
//   1. app-start   The app, with its sign-in token, asks for the consent address. The signed state names that
//                  person and carries `app: true`.
//   2. callback    The system browser comes back from Google or Microsoft. No cookie there says who it is, so
//                  nothing is exchanged and nothing is saved: the code is sealed with the state into a ticket
//                  (ticket.ts) and sent to the app's own link, a constant.
//   3. app-finish  The app hands the ticket back with its sign-in token. Only when the state inside names the
//                  caller is the code exchanged and the account saved, by the same function the web's callback
//                  uses (connect.ts).
//
// So a ticket that reaches another app or another person connects nothing: it is only good together with the
// sign-in token of whoever started it. Nothing a caller sends chooses where the browser is sent.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CALENDAR_APP_LINK } from "@/features/calendar/app-link";
import { bearerToken, requestUser } from "@/server/auth/request-user";
import { stateSecret, tokenKey } from "./config";
import type { ProviderId } from "./provider";
import { STATE_TTL_SECONDS, signState, verifyState, type ConsentPurpose, type OAuthState } from "./state";
import { openTicket, sealTicket } from "./ticket";

/** Never kept by anything between the server and the app. */
const NO_STORE = { "cache-control": "no-store" };

/**
 * The caller of an app route, known by their sign-in token and nothing else. `requestUser` falls back to the cookie
 * when there is no bearer header; these routes do not, because the web has its own flow and a ticket must only ever
 * be finished by a request that names its caller.
 */
export async function appCaller(request: Pick<Request, "headers">): Promise<{ id: string; email: string | null } | null> {
  if (!bearerToken(request.headers.get("authorization"))) return null;
  const { user } = await requestUser(request);
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** The state for a consent started in the app. `next` is never read for one: it goes back to `CALENDAR_APP_LINK`. */
export function signAppState(userId: string, purpose: ConsentPurpose, provider: ProviderId, now = Math.floor(Date.now() / 1000)): { state: string; nonce: string } {
  const nonce = randomUUID();
  return { nonce, state: signState({ userId, purpose, provider, next: "/settings", nonce, exp: now + STATE_TTL_SECONDS, app: true }, stateSecret()) };
}

/** What the app link says when there is no ticket: the person's own no, or anything else ("try again"). Nothing of the provider's text. */
export type AppReturnError = "denied" | "failed";

function leave(query: string): NextResponse {
  const res = NextResponse.redirect(`${CALENDAR_APP_LINK}?${query}`);
  for (const [name, value] of Object.entries(NO_STORE)) res.headers.set(name, value);
  return res;
}

/**
 * The callback's answer for a consent that was started in the app. It exchanges nothing and saves nothing, whoever
 * is signed in to this browser: a good state and a code become a ticket, everything else an error, and both go to
 * the same constant link.
 */
export function appReturn(provider: ProviderId, query: URLSearchParams): NextResponse {
  try {
    const raw = query.get("state");
    const state = verifyState(raw, stateSecret());
    if (!raw || !state || state.app !== true || state.provider !== provider) return leave("error=failed");
    const refused = query.get("error");
    if (refused) return leave(`error=${refused === "access_denied" ? "denied" : "failed"}`);
    const code = query.get("code");
    if (!code) return leave("error=failed");
    return leave(`ticket=${sealTicket({ code, state: raw }, tokenKey())}`);
  } catch (e) {
    console.error("calendar app return failed", e instanceof Error ? e.message : "unknown");
    return leave("error=failed");
  }
}

export type TicketClaim = { ok: true; state: OAuthState; code: string } | { ok: false; status: 400 | 403; error: "invalid_ticket" | "forbidden" };

/**
 * Whether this caller may finish this ticket. In order: it is one this server sealed; the state inside is ours, was
 * started in the app for this provider, and has not expired; and it names the caller. Only then is the code handed
 * on to be exchanged.
 */
export function claimTicket(ticket: unknown, provider: ProviderId, callerId: string, now = Math.floor(Date.now() / 1000)): TicketClaim {
  const invalid: TicketClaim = { ok: false, status: 400, error: "invalid_ticket" };
  let held: ReturnType<typeof openTicket>;
  try {
    held = openTicket(ticket, tokenKey());
  } catch {
    return invalid;
  }
  if (!held) return invalid;
  const state = verifyState(held.state, stateSecret(), now);
  if (!state || state.app !== true || state.provider !== provider) return invalid;
  if (state.userId !== callerId) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, state, code: held.code };
}

export const unauthenticated = (): NextResponse => NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
export const answer = (body: Record<string, unknown>, status = 200): NextResponse => NextResponse.json(body, { status, headers: NO_STORE });

/** The body of a POST as an object; anything else (no body, not JSON, an array, a string) is an empty one. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
