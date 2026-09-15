// Which ways in the auth server offers. Google is on only where a client is
// configured (supabase/config.toml, or the hosted project's provider settings),
// and the login page asks the server rather than trusting an env flag.
export interface SignInProviders {
  google: boolean;
}

export async function fetchSignInProviders(fetchImpl: typeof fetch = fetch): Promise<SignInProviders> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    const res = await fetchImpl(`${url}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } });
    if (!res.ok) return { google: false };
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return { google: body.external?.google === true };
  } catch {
    return { google: false };
  }
}
