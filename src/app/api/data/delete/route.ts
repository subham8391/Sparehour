// Delete permanently (PRODUCT_SPEC.md §6: only in Settings › Data, always
// naming the count). Devices write only soft deletes; this is the one hard
// delete, done on the server as the signed-in person. The function removes
// only archived or dropped tasks the caller can see and says how many went;
// sync then takes them off every device.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createUserScopedClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ids: z.array(z.uuid()).min(1).max(5000) });

export async function POST(req: NextRequest) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data, error } = await supabase.rpc("delete_tasks_permanently", { p_ids: parsed.data.ids });
  if (error) {
    console.error("delete_tasks_permanently failed", error.message);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  return NextResponse.json({ deleted: Number(data ?? 0) }, { headers: { "cache-control": "no-store" } });
}
