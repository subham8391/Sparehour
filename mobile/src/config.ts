// Where the app's server is (ANDROID_APP_SPEC.md §7). Expo puts EXPO_PUBLIC_* values into the bundle when it is
// built, so these are public by nature: the same two Supabase values the web page already carries, and two addresses.
// Nothing secret belongs here.

/** Without a trailing slash, so paths are added plainly. */
const clean = (v: string | undefined) => (v ?? "").trim().replace(/\/+$/, "");

export const config = {
  /** The Sparehour web app: it mints the sync token and takes the uploads (/api/sync/*). */
  appUrl: clean(process.env.EXPO_PUBLIC_APP_URL),
  /** The PowerSync service itself. The web reaches it through its own origin; the phone goes straight there. */
  powersyncUrl: clean(process.env.EXPO_PUBLIC_POWERSYNC_URL),
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
};

/** The names of the values that are missing, so the first screen can say exactly what to set. */
export function missingConfig(c: typeof config = config): string[] {
  const names: [keyof typeof config, string][] = [
    ["appUrl", "EXPO_PUBLIC_APP_URL"],
    ["powersyncUrl", "EXPO_PUBLIC_POWERSYNC_URL"],
    ["supabaseUrl", "EXPO_PUBLIC_SUPABASE_URL"],
    ["supabaseAnonKey", "EXPO_PUBLIC_SUPABASE_ANON_KEY"],
  ];
  return names.filter(([key]) => !c[key]).map(([, name]) => name);
}
