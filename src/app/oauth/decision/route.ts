// The consent screen's answer (DECISIONS.md, amendment 2026-10-23): records what the app may do in
// public.app_connections, then approves or denies the authorization with Supabase Auth and sends the browser on to
// the app with its code (or its access_denied). A plain form post from this origin only: anything else, or anything
// without the person's session, is refused. The app's identity is read from the auth server, never from the form.
import { NextResponse } from "next/server";
import { sameOrigin } from "@/server/auth/same-origin";
import { createUserScopedClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: Request, id: string, error?: string) =>
  NextResponse.redirect(new URL(`/oauth/consent?authorization_id=${encodeURIComponent(id)}${error ? `&error=${error}` : ""}`, req.url), 303);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const id = typeof form?.get("authorization_id") === "string" ? String(form?.get("authorization_id")) : "";
  if (!id || id.length > 200) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const allow = form?.get("decision") === "allow";
  const access = form?.get("access") === "read" ? "read" : "write";

  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`, req.url), 303);

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !details) return back(req, id);
  if (!("authorization_id" in details)) return NextResponse.redirect(details.redirect_url, 303);

  if (allow) {
    const { error: saveError } = await supabase
      .from("app_connections")
      .upsert({ user_id: user.id, client_id: details.client.id, client_name: details.client.name || null, access }, { onConflict: "user_id,client_id" });
    if (saveError) {
      console.error("app connection save failed", saveError);
      return back(req, id, "save");
    }
  }
  const { data: answer, error: answerError } = allow
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (answerError || !answer?.redirect_url) {
    console.error("oauth decision failed", answerError);
    return back(req, id, "save");
  }
  return NextResponse.redirect(answer.redirect_url, 303);
}
