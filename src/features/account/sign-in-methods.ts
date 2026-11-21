// The sign-in methods linked to the account, as Settings › Account lists them
// (SCREENS.md §18: "connected sign-in methods"), read from the auth server's
// identities. The auth client is loaded only when Account asks, as signing out
// does, so the Settings shell carries just this loader (SYSTEM_DESIGN.md §11.6).
import { signInMethodLabels } from "./sign-in-labels";

// What each method is called is in sign-in-labels.ts, shared with the Android app; handed on, so imports are unchanged.
export { signInMethodLabels };

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
