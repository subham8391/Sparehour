// Server-side Supabase clients. The user-scoped client carries the caller's
// session, so every query it makes runs under RLS as that user. The service
// role client is for background jobs only (lint-enforced import boundary).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** A client that acts as the signed-in user (cookie session). */
export async function createUserScopedClient() {
  const cookieStore = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/** Background jobs only. Bypasses RLS — never import this from request handlers. */
export function serviceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url(), key, { auth: { persistSession: false } });
}
