// Sparehour's MCP endpoint (DECISIONS.md, amendment 2026-10-23): Streamable HTTP, stateless, one fresh server per
// request bound to the caller. Every call carries the person's OAuth access token (src/server/mcp/auth.ts); without
// one the answer is a 401 whose challenge points at /.well-known/oauth-protected-resource/api/mcp, which is how
// claude.ai, Claude Desktop and Claude Code find Supabase Auth's OAuth server and send the person to /oauth/consent.
// Bearer tokens, never cookies, so any origin may call it (CORS is open, as nothing ambient is trusted).
import { createMcpHandler } from "@modelcontextprotocol/server";
import { after } from "next/server";
import { googleConfigured } from "@/server/calendar/config";
import { pushUser } from "@/server/calendar/run";
import { refreshPreview } from "@/server/lists/refresh";
import { authenticate, type Caller } from "@/server/mcp/auth";
import { Planner } from "@/server/mcp/planner";
import { SupabaseStore } from "@/server/mcp/store";
import { buildServer, type Effects } from "@/server/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
};

/** What a write asks for once the answer has gone: the calendar told now rather than at the tick, a link's preview fetched. */
function effectsFor(caller: Caller): Effects {
  return {
    calendarChanged: () =>
      after(async () => {
        if (!googleConfigured()) return;
        await pushUser(caller.userId).catch((e) => console.error("mcp calendar push failed", e));
      }),
    linkSaved: (itemId, url) =>
      after(async () => {
        await refreshPreview(caller.db, itemId, url, { tries: 2, ms: 500 }).catch((e) => console.error("mcp link preview failed", e));
      }),
  };
}

const handler = createMcpHandler(({ authInfo }) => {
  const caller = authInfo?.extra?.caller as Caller;
  const planner = new Planner(new SupabaseStore(caller.db, caller.userId), { device: `mcp:${caller.clientId}`.slice(0, 128) });
  return buildServer(planner, caller.access, effectsFor(caller));
});

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function serve(req: Request): Promise<Response> {
  const who = await authenticate(req);
  if (who instanceof Response) return withCors(who);
  return withCors(await handler.fetch(req, { authInfo: { ...who.auth, extra: { caller: who.caller } } }));
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
