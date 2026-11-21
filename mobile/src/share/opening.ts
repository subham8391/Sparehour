// Where an address the app is opened with leads (Expo Router's +native-intent, app/+native-intent.ts). Three come from
// outside the app's own screens, and each opens what the web app opens for the same thing:
//
// - what another app shared (Android's share sheet; expo-sharing opens the app at `<scheme>://expo-sharing`): the
//   Inbox with quick add holding the words, as the web's /share does, or the page that says nothing came through;
// - the icon's "Add a task" shortcut, the web manifest's `/today?quickadd=1`: Today with quick add open and empty;
// - the icon's "Today" shortcut, the web manifest's `/today`: Today.
//
// The shortcuts carry the web's own addresses (../../../src/features/pwa/shortcuts.ts, written into the build by
// plugins/app-shortcuts.js), so this is the one place that says what the web's Today is called here. Every other
// address is the app's own and is left as it came. Pure: the share is read through `shared`, only when asked.

/** The host expo-sharing gives the address a share opens the app with. */
export const SHARE_HOST = "expo-sharing";

/** The page that says a share brought nothing (the web's /share with nothing to hand on). */
export const NOTHING_SHARED = "/share";

export interface Opening {
  /** The address to open instead: the app's own, or the one that came when it needs no change. */
  to: string;
  /** Quick add is asked for too: empty for the shortcut, holding `text` for a share. */
  quickAdd?: { text?: string };
}

/** `sparehour://today?quickadd=1`, `sparehour:///today`, `/today` → the path without its slashes, and the query. */
function parts(address: string): { path: string; query: string } {
  const m = /^(?:[a-z][a-z0-9+.-]*:)?\/*([^?#]*)(?:\?([^#]*))?/i.exec(address);
  return { path: (m?.[1] ?? "").replace(/\/+$/, ""), query: m?.[2] ?? "" };
}

/**
 * @param address what the app was opened with: a full address with the app's scheme, or a path.
 * @param shared reads what was shared as one quick-add line (empty when nothing came through); called for a share only.
 */
export function opening(address: string, shared: () => string): Opening {
  const { path, query } = parts(address);
  if (path === SHARE_HOST) {
    const text = shared();
    return text ? { to: "/inbox", quickAdd: { text } } : { to: NOTHING_SHARED };
  }
  // The web's Today is the first tab here.
  if (path === "today") return /(?:^|&)quickadd=1(?:&|$)/.test(query) ? { to: "/", quickAdd: {} } : { to: "/" };
  return { to: address };
}
