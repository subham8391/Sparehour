// "Continue with Google" on the phone (ONBOARDING.md step 1; DECISIONS.md Q25: identity only, calendar scopes are
// asked for later). The same Supabase Auth sign-in as the web's button, through the system browser instead of a
// page redirect: the auth server gives the address, Google's screen runs in the phone's own browser, and the
// browser comes back to the app's link with a code. PKCE (supabase.ts) makes that code useless to anyone else: it
// is exchanged for a session only together with the verifier this app made and kept on the device.
import { fetchSignInProviders, type SignInProviders } from "@/features/auth/providers";
import { config } from "~/config";
import { browserSession, type BrowserReturn } from "./browser-session";
import { AUTH_RETURN_LINK } from "./return-link";
import { supabase } from "./supabase";

/** Whether the auth server offers Google: the web's own question (features/auth/providers.ts), asked with the app's two values. */
export const signInProviders = (): Promise<SignInProviders> => fetchSignInProviders(fetch, { url: config.supabaseUrl, anonKey: config.supabaseAnonKey });

export type GoogleSignIn =
  /** A session is on the device; the session provider takes over from here. */
  | { outcome: "signed-in" }
  /** The person closed the browser or said no on Google's screen. */
  | { outcome: "cancelled" }
  | { outcome: "failed"; message?: string };

export interface GoogleSignInDeps {
  auth: {
    signInWithOAuth: (credentials: { provider: "google"; options: { redirectTo: string; skipBrowserRedirect: true } }) => Promise<{ data: { url: string | null }; error: { message: string } | null }>;
    exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
  };
  session: (startUrl: string, returnLink: string) => Promise<BrowserReturn>;
}

export async function signInWithGoogle(deps: GoogleSignInDeps = { auth: supabase().auth, session: browserSession }): Promise<GoogleSignIn> {
  try {
    // `skipBrowserRedirect`: the address is handed back to be opened here, and the verifier is stored first.
    const { data, error } = await deps.auth.signInWithOAuth({ provider: "google", options: { redirectTo: AUTH_RETURN_LINK, skipBrowserRedirect: true } });
    if (error || !data.url) return { outcome: "failed", message: error?.message };

    const back = await deps.session(data.url, AUTH_RETURN_LINK);
    if (back.type === "closed") return { outcome: "cancelled" };
    if (back.params.error) return back.params.error === "access_denied" ? { outcome: "cancelled" } : { outcome: "failed", message: back.params.error_description || undefined };
    const code = back.params.code;
    if (!code) return { outcome: "failed" };

    const { error: refused } = await deps.auth.exchangeCodeForSession(code);
    return refused ? { outcome: "failed", message: refused.message } : { outcome: "signed-in" };
  } catch (e) {
    return { outcome: "failed", message: e instanceof Error ? e.message : undefined };
  }
}
