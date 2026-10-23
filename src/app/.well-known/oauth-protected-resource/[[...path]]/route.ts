// RFC 9728 protected-resource metadata for the MCP endpoint (DECISIONS.md, amendment 2026-10-23): served at
// /.well-known/oauth-protected-resource/api/mcp (the path the 401 names) and at the bare well-known path for clients
// that look there. It names Supabase Auth as the authorization server; the client reads that server's own metadata
// (/.well-known/oauth-authorization-server/auth/v1 on the Supabase host), registers itself and sends the person to
// /oauth/consent. Public, read by clients from any origin.
import { NextResponse } from "next/server";
import { originOf, protectedResource } from "@/server/mcp/auth";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Mcp-Protocol-Version" };

export function GET(req: Request) {
  return NextResponse.json(protectedResource(originOf(req)), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
