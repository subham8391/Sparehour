// Where a sign-in link or a Google consent lands. A PKCE `code` (Google, or
// the magic link opened on the device that asked) is exchanged for a session;
// a `token_hash` (a link verified by the auth server directly) is verified.
// Either way the session cookie is set here and the person continues to
// where they were going. Failures return to /login with the reason.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/features/auth/safe-next";
import { createUserScopedClient } from "@/server/auth/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let failure: string | null = null;
  if (code) {
    const supabase = await createUserScopedClient();
    failure = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createUserScopedClient();
    failure = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error?.message ?? null;
  } else {
    failure = url.searchParams.get("error_description") ?? "That sign-in link is incomplete. Ask for a new one.";
  }

  if (failure) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", failure);
    if (next !== "/today") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
