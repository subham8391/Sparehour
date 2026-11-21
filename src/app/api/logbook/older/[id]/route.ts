// Deleting one older finished task for good (DECISIONS.md, amendment 2026-11-15). `finished_tasks` is read-only for
// people; `public.finished_task_delete` (migration 20261115000100) is the one way in, and this calls it as the
// signed-in person for the Logbook's read-only view. The answer says whether a row went: `deleted: false` is a row
// that was already gone (or was never theirs: the two are not told apart). Where the database has not got the
// function yet the answer is a plain "not available" with a status no caller can take for success.
import { NextResponse } from "next/server";
import { requestUser } from "@/server/auth/request-user";
import { notThere, rowId } from "@/server/logbook/older";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The browser's cookie session, or the phone app's access token (server/auth/request-user.ts).
  const { supabase, user } = await requestUser(req);
  if (!user) return answer({ error: "unauthenticated" }, 401);
  const id = rowId((await params).id);
  if (!id) return answer({ error: "bad_request" }, 400);
  const { data, error } = await supabase.rpc("finished_task_delete", { p_id: id });
  if (error) {
    if (notThere(error)) return answer({ error: "unavailable", available: false, deleted: false }, 501);
    // The function's own refusal: a connection that may only read.
    if (error.code === "42501") return answer({ error: "forbidden", deleted: false }, 403);
    console.error("deleting a finished task failed", error);
    return answer({ error: "server", deleted: false }, 500);
  }
  return answer({ available: true, deleted: data === true });
}
