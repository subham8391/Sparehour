// The phone's Supabase client: sign-in and the session only (ANDROID_APP_SPEC.md §6). Data never goes through it;
// that is the local database's job. The session is kept on the device and refreshed while the app is in front.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { config } from "~/config";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const auth = client.auth;
  // Tokens are refreshed only while someone is looking: a timer in the background is killed by Android anyway.
  AppState.addEventListener("change", (state) => {
    if (state === "active") void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
  return client;
}

/** The access token of the session on this device, refreshed if it is about to run out; null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
