// The sign-in methods linked to the account, as Settings › Account lists them
// (SCREENS.md §18: "connected sign-in methods"), read from the auth server's
// identities. The auth client is loaded only when Account asks, as signing out
// does, so the Settings shell carries just this loader (SYSTEM_DESIGN.md §11.6).

/** What each auth provider is called in Settings; an emailed code (or link) is the "email" identity. */
const METHOD: Record<string, string> = { google: "Google", email: "Email code", apple: "Apple", github: "GitHub", azure: "Microsoft" };

/** The sign-in methods linked to the account, named once each, in the order they were linked. */
export function signInMethodLabels(identities: readonly { provider: string }[] | null | undefined): string[] {
  const out: string[] = [];
  for (const { provider } of identities ?? []) {
    const label = METHOD[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
    if (provider && !out.includes(label)) out.push(label);
  }
  return out;
}

let methods: Promise<string[]> | null = null;

/**
 * The account's sign-in methods from the auth server ("Google", "Email code"), once per page load. Offline, the
 * session this device already holds answers instead; with neither it rejects and Account says it needs a connection.
 */
export function loadSignInMethods(): Promise<string[]> {
  methods ??= (async () => {
    const { supabaseBrowser } = await import("@/data/supabase-browser");
    const auth = supabaseBrowser().auth;
    const { data, error } = await auth.getUserIdentities();
    if (!error && data) return signInMethodLabels(data.identities);
    const held = (await auth.getSession()).data.session?.user.identities;
    if (held?.length) return signInMethodLabels(held);
    throw error ?? new Error("No sign-in methods");
  })().catch((e: unknown) => {
    methods = null; // ask again next time Account opens
    throw e;
  });
  return methods;
}
