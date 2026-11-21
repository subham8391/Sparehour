// The apps a person has let in, as the auth server holds them (its OAuth 2.1 grants; DECISIONS.md, amendment
// 2026-10-23), for either kind of caller of a route handler (request-user.ts). The auth library's own calls
// (`auth.oauth.listGrants`, `auth.oauth.revokeGrant`) take the access token from the client's stored session. The
// browser's cookie client has one. The phone app's token client does not: it carries the token as a header only, and
// those calls answer "no session" before asking anything. So with a bearer token the same two endpoints of the auth
// server are asked directly, as that person; without one the library does it, as before.
import type { SupabaseClient } from "@supabase/supabase-js";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** What Settings › Connected apps reads of a grant. */
export interface Grant {
  client: { id: string; name: string };
  granted_at?: string | null;
}

export interface GrantsAnswer<T> {
  data: T | null;
  error: { message: string } | null;
}

/** One call to the auth server's grants endpoint as the token's person. */
async function ask(token: string, method: "GET" | "DELETE", query: string, fetchImpl: typeof fetch): Promise<GrantsAnswer<unknown>> {
  try {
    const res = await fetchImpl(`${url()}/auth/v1/user/oauth/grants${query}`, { method, headers: { apikey: anonKey(), Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return { data: null, error: { message: `auth server answered ${res.status}` } };
    return { data: method === "GET" ? await res.json() : {}, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "auth server unreachable" } };
  }
}

/** The caller's grants. `token` is the request's bearer token (the phone app), or null for the cookie session. */
export async function listGrants(supabase: SupabaseClient, token: string | null, fetchImpl: typeof fetch = fetch): Promise<GrantsAnswer<Grant[]>> {
  if (!token) return supabase.auth.oauth.listGrants();
  const { data, error } = await ask(token, "GET", "", fetchImpl);
  return error ? { data: null, error } : { data: Array.isArray(data) ? (data as Grant[]) : [], error: null };
}

/** Revokes the caller's grant to one app: its tokens stop working at once. */
export async function revokeGrant(supabase: SupabaseClient, token: string | null, clientId: string, fetchImpl: typeof fetch = fetch): Promise<GrantsAnswer<unknown>> {
  if (!token) return supabase.auth.oauth.revokeGrant({ clientId });
  return ask(token, "DELETE", `?client_id=${encodeURIComponent(clientId)}`, fetchImpl);
}
