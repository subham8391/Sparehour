// How a person's estimates run (DECISIONS.md, amendment 2026-11-15): the newest finished tasks with a recorded
// length, read as the signed-in person (the tables' read policies hold) and answered as what core/estimates learned
// from them. The app asks now and then and keeps the answer on the device, so a suggestion never waits on this.
import { NextResponse } from "next/server";
import { SAMPLE_LIMIT } from "@/core/estimates";
import { createUserScopedClient } from "@/server/auth/supabase";
import { completionRecord, learnedFrom, spaceParam, tableMissing, type CompletionRecord, type TookRecord } from "@/server/estimates/learned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = "estimate_min, actual_min, project_id, completed_at";

export async function GET(req: Request) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const space = spaceParam(new URL(req.url).searchParams);
  if (space === undefined) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // The newest of each, with a length: finished this week, finished days of repeats, and finished before.
  let tasks = supabase.from("tasks").select(COLUMNS).eq("state", "done").is("deleted_at", null).not("actual_min", "is", null);
  let completions = supabase.from("task_completions").select("actual_min, completed_at, task:tasks(estimate_min, project_id)").is("deleted_at", null).not("actual_min", "is", null);
  let finished = supabase.from("finished_tasks").select(COLUMNS).not("actual_min", "is", null);
  if (space) {
    tasks = tasks.eq("space_id", space);
    completions = completions.eq("space_id", space);
    finished = finished.eq("space_id", space);
  }
  const newest = { ascending: false } as const;
  const [t, c, f] = await Promise.all([
    tasks.order("completed_at", newest).limit(SAMPLE_LIMIT),
    completions.order("completed_at", newest).limit(SAMPLE_LIMIT),
    finished.order("completed_at", newest).limit(SAMPLE_LIMIT),
  ]);
  const failed = t.error ?? c.error ?? (tableMissing(f.error) ? null : f.error);
  if (failed) {
    console.error("learned estimates failed", failed);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  const learned = learnedFrom((t.data ?? []) as TookRecord[], ((c.data ?? []) as CompletionRecord[]).map(completionRecord), (f.error ? [] : (f.data ?? [])) as TookRecord[]);
  return NextResponse.json({ learned }, { headers: { "Cache-Control": "private, no-store" } });
}
