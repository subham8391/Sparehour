import { NextResponse, type NextRequest } from "next/server";
import { deleteAfter } from "@/features/account/deletion";
import { createUserScopedClient } from "@/server/auth/supabase";
import { UploadBody, sanitize } from "@/server/sync/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // An account waiting for deletion syncs nothing (SYSTEM_DESIGN.md §9.6: sync stops at once).
  if (deleteAfter(user.app_metadata)) return NextResponse.json({ error: "account_deleted" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = UploadBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });

  // Ops that sanitize empties out are reported as applied: there was nothing the client may write.
  const applied: string[] = [];
  const ops = [];
  for (const op of parsed.data.ops) {
    const clean = sanitize(op);
    if (clean) ops.push(clean);
    else applied.push(op.client_id);
  }

  if (ops.length === 0) return NextResponse.json({ applied, rejected: [] });

  const { data, error } = await supabase.rpc("apply_mutations", {
    p_device: parsed.data.device_id,
    p_ops: ops,
  });
  if (error) {
    console.error("apply_mutations failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  const result = data as { applied: string[]; rejected: { client_id: string; code: string }[] };
  return NextResponse.json({ applied: [...applied, ...result.applied], rejected: result.rejected });
}
