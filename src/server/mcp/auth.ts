// Who is calling the MCP endpoint (DECISIONS.md, amendment 2026-10-23). Supabase Auth's OAuth 2.1 server issues the
// token after the person approves the app on /oauth/consent: it is that person's own access token plus a
// `client_id` claim, so PostgREST, RLS, the guards and apply_mutations treat every call as theirs. The endpoint asks
// the auth server about the token (a revoked connection or a signed-out session stops at once, not when the token
// expires), takes only app tokens (first-party sessions have no client_id), and reads the access the person chose
// for that app. Discovery follows RFC 9728: a 401 names the protected-resource document, which names the auth server.
import { OAuthError, OAuthErrorCode, bearerAuthChallengeResponse, verifyBearerToken, type AuthInfo } from "@modelcontextprotocol/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteAfter } from "@/features/account/deletion";
import type { Access } from "./tools";

export interface Caller {
  userId: string;
  clientId: string;
  clientName: string | null;
  access: Access;
  /** PostgREST as this person, with this token. */
  db: SupabaseClient;
}

const supabaseUrl = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321").replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** The authorization server the MCP endpoint relies on: Supabase Auth's issuer. */
export const authIssuer = () => `${supabaseUrl()}/auth/v1`;

/** The MCP endpoint's own URL on this origin (the RFC 8707 resource). */
export const resourceUrl = (origin: string) => `${origin}/api/mcp`;

/** RFC 9728: the protected-resource document for a resource at /api/mcp lives at /.well-known/oauth-protected-resource/api/mcp. */
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

/** The public origin a request arrived on. */
export function originOf(req: Request): string {
  return new URL(req.url).origin;
}

/** The protected-resource metadata for this origin. */
export function protectedResource(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [authIssuer()],
    bearer_methods_supported: ["header"],
    resource_name: "Sparehour",
  };
}

/** A token's claims, read without checking them: the auth server has already said whether the token is good. */
export function claimsOf(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function personClient(token: string): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The caller, or the 401 (with its discovery challenge) that the request gets instead. */
export async function authenticate(req: Request, client: (token: string) => SupabaseClient = personClient): Promise<{ auth: AuthInfo; caller: Caller } | Response> {
  const metadata = resourceMetadataUrl(originOf(req));
  let caller: Caller | null = null;
  const verifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const db = client(token);
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) throw new OAuthError(OAuthErrorCode.InvalidToken, "The token is not valid any more; connect Sparehour again.");
      const claims = claimsOf(token);
      const clientId = typeof claims.client_id === "string" && claims.client_id ? claims.client_id : null;
      if (!clientId) throw new OAuthError(OAuthErrorCode.InvalidToken, "This endpoint takes tokens issued to a connected app: connect through Sparehour's consent screen.");
      if (deleteAfter(data.user.app_metadata)) throw new OAuthError(OAuthErrorCode.InvalidToken, "This Sparehour account is waiting to be deleted.");
      const { data: connection } = await db.from("app_connections").select("access, client_name").eq("client_id", clientId).maybeSingle();
      // No row (a grant made before the row, or a row removed): read only, as Postgres also assumes.
      caller = { userId: data.user.id, clientId, clientName: connection?.client_name ?? null, access: connection?.access === "write" ? "write" : "read", db };
      const exp = typeof claims.exp === "number" ? claims.exp : undefined;
      const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];
      return { token, clientId, scopes, expiresAt: exp };
    },
  };
  try {
    const auth = await verifyBearerToken(req.headers.get("authorization"), { verifier, resourceMetadataUrl: metadata });
    return { auth, caller: caller as unknown as Caller };
  } catch (e) {
    return bearerAuthChallengeResponse(e, { resourceMetadataUrl: metadata });
  }
}
