// What each sign-in method is called in Settings › Account (SCREENS.md §18: "connected sign-in methods"). Its own
// module, free of the auth client that sign-in-methods.ts loads, so the Android app, which has its own auth client,
// names an account's identities the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3). sign-in-methods.ts hands
// `signInMethodLabels` on, so the web's imports are unchanged.

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
