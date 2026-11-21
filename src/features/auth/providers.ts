// Which ways in the auth server offers. Google is on only where a client is
// configured (supabase/config.toml, or the hosted project's provider settings),
// and the login page asks the server rather than trusting an env flag.
export interface SignInProviders {
  google: boolean;
}

/** Where the auth server is and the public key it is asked with. */
export interface AuthServer {
  url: string;
  anonKey: string;
}

/** The web's own: the two public values the page already carries. */
const webAuthServer = (): AuthServer => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" });

/** `server` is the web's unless said: the Android app asks the same question of the same server with its own two values. */
export async function fetchSignInProviders(fetchImpl: typeof fetch = fetch, server: AuthServer = webAuthServer()): Promise<SignInProviders> {
  try {
    const res = await fetchImpl(`${server.url}/auth/v1/settings`, { headers: { apikey: server.anonKey } });
    if (!res.ok) return { google: false };
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return { google: body.external?.google === true };
  } catch {
    return { google: false };
  }
}
