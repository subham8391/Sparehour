// The ticket a consent started in the phone app comes back with (DECISIONS.md, amendment 2026-11-21 "a real Android
// app"). The browser that returns from Google or Microsoft has no cookie saying who is in it, so the callback saves
// nothing: it seals the provider's code together with the signed state into this, and hands it to the app. Sealed
// (AES-256-GCM, crypto.ts) so the code is never readable on its way through the app link, and so nobody but this
// server can make one. A ticket alone connects nothing: `app-finish` also needs the sign-in token of the person the
// state names (app-connect.ts).
import { createHmac } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";

export interface AppTicket {
  /** The provider's authorization code, single use at the provider. */
  code: string;
  /** The signed state exactly as it came back (state.ts): who started this, with which provider, for what, and until when. */
  state: string;
}

/** Longer than any ticket this server makes (a Microsoft code runs to a couple of thousand characters); the rest is not ours. */
const MAX_TICKET_CHARS = 8192;

/** Its own key, worked out from the token key, so a ticket and a stored token can never be opened as one another. */
const ticketKey = (key: Buffer): Buffer => createHmac("sha256", key).update("calendar-app-ticket:v1").digest();

export function sealTicket(ticket: AppTicket, key: Buffer): string {
  return encryptSecret(JSON.stringify({ v: 1, code: ticket.code, state: ticket.state }), ticketKey(key)).toString("base64url");
}

/** What a ticket holds, or null for anything this server did not seal: changed, cut short, sealed with another key, or not a ticket. */
export function openTicket(sealed: unknown, key: Buffer): AppTicket | null {
  if (typeof sealed !== "string" || sealed.length === 0 || sealed.length > MAX_TICKET_CHARS) return null;
  try {
    const held = JSON.parse(decryptSecret(Buffer.from(sealed, "base64url"), ticketKey(key))) as { v?: unknown; code?: unknown; state?: unknown } | null;
    if (!held || held.v !== 1) return null;
    if (typeof held.code !== "string" || held.code.length === 0 || typeof held.state !== "string") return null;
    return { code: held.code, state: held.state };
  } catch {
    return null;
  }
}
