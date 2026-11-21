// Who is calling a route handler (docs/mobile/ANDROID_APP_SPEC.md §6; DECISIONS.md, amendment 2026-11-21 "a real
// Android app"). The browser is known by its session cookie. The phone app has no cookie: it sends the same person's
// Supabase access token as `Authorization: Bearer …`. Either way the client that comes back acts as that person,
// under RLS, so a handler runs the same checks and the same writes for both.
//
// Only a first-party session token is taken here. A token issued to a connected app (it carries a `client_id`
// claim; src/server/mcp/auth.ts) belongs to /api/mcp and its consent, and is refused: an app the person approved to
// read through MCP must not be able to open the sync stream or the upload route with the same token.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createUserScopedClient } from "./supabase";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** The token of an `Authorization: Bearer …` header, or null when there is none. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** A token's claims, read without checking them: the auth server is asked whether the token is good. */
function claimsOf(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** PostgREST and the auth server as the person this token belongs to. */
export function tokenClient(token: string): SupabaseClient {
  return createClient(url(), anonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface RequestUser {
  /** Acts as the caller under RLS; with no caller it can only be refused things. */
  supabase: SupabaseClient;
  user: User | null;
}

/**
 * The caller of a route handler. With an `Authorization: Bearer` header the token decides, and the cookie is not
 * looked at (a request that names its caller is that caller's, or nobody's); without one, the cookie session does.
 */
export async function requestUser(
  request: Pick<Request, "headers">,
  deps: { tokenClient?: (token: string) => SupabaseClient; cookieClient?: () => Promise<SupabaseClient> } = {},
): Promise<RequestUser> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    const supabase = await (deps.cookieClient ?? (createUserScopedClient as () => Promise<SupabaseClient>))();
    const { data } = await supabase.auth.getUser();
    return { supabase, user: data.user ?? null };
  }
  const supabase = (deps.tokenClient ?? tokenClient)(token);
  // A connected app's token is the person's own with a client_id claim: not for these routes.
  if (typeof claimsOf(token).client_id === "string") return { supabase, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { supabase, user: error ? null : (data.user ?? null) };
}
