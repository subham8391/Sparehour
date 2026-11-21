// A call to the Sparehour web app's own API from the phone (ANDROID_APP_SPEC.md §6). The browser is known to the
// server by its cookie; the phone sends the session's access token as a bearer header instead. A route the phone
// calls must take its caller from `requestUser(request)` (../../src/server/auth/request-user.ts) on the server side.
import { accessToken } from "~/auth/supabase";
import { config } from "~/config";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`${config.appUrl}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
}
