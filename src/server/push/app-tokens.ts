// A phone turning reminders on or off (docs/mobile/ANDROID_APP_SPEC.md §6).
// The app proves who it is with its sign-in token; the server keeps the
// phone's Expo token in public.app_push_tokens, which nobody writes directly.
// A token is one phone: when another account signs in on it and turns
// reminders on, the token moves to that account, so the first person's
// reminders stop reaching a phone they have left.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExpoPushToken } from "./expo";

export type TokenAnswer = { ok: true } | { ok: false; status: 400 | 409 | 500; error: "bad_token" | "too_many" | "server" };

export async function registerAppToken(db: SupabaseClient, userId: string, token: unknown, now = new Date()): Promise<TokenAnswer> {
  if (!isExpoPushToken(token)) return { ok: false, status: 400, error: "bad_token" };
  const { error } = await db
    .from("app_push_tokens")
    .upsert({ user_id: userId, token, platform: "android", failure_count: 0, deleted_at: null, updated_at: now.toISOString() }, { onConflict: "token" });
  if (!error) return { ok: true };
  if (error.code === "54000") return { ok: false, status: 409, error: "too_many" };
  console.error("app push token not saved", error.message);
  return { ok: false, status: 500, error: "server" };
}

/** Turning off, or signing out: only the caller's own row is retired. */
export async function forgetAppToken(db: SupabaseClient, userId: string, token: unknown, now = new Date()): Promise<TokenAnswer> {
  if (!isExpoPushToken(token)) return { ok: false, status: 400, error: "bad_token" };
  const { error } = await db.from("app_push_tokens").update({ deleted_at: now.toISOString(), updated_at: now.toISOString() }).eq("token", token).eq("user_id", userId).is("deleted_at", null);
  if (!error) return { ok: true };
  console.error("app push token not retired", error.message);
  return { ok: false, status: 500, error: "server" };
}
