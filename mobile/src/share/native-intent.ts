// The address the app is opened with, before any screen is drawn (Expo Router's `redirectSystemPath`; the route file
// app/+native-intent.ts hands it on). opening.ts decides where it leads; here that is carried out: what was shared
// is read from expo-sharing and cleared so it is offered once, and quick add is asked for through its own waiting
// room (screens/quick-add/ask.ts), because nothing of the app is on screen yet, and a signed-out phone signs in first.
//
// Share to Sparehour uses expo-sharing's own receiving side (Expo SDK 58, "Sharing to your app from other apps"): its
// config plugin (app.json) puts the intent filter for shared text in the manifest, and the app is opened at
// `sparehour://expo-sharing` both from cold and when it is already open.
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { redirectSystemPath as returnLink } from "~/auth/return-link";
import { askForQuickAdd } from "~/screens/quick-add/ask";
import { opening } from "./opening";
import { lineFromShare } from "./shared-line";

/** What was shared as one line, taken: a second look finds nothing, so a share is handed to quick add once. */
function takeShared(): string {
  try {
    const line = lineFromShare(getSharedPayloads());
    clearSharedPayloads();
    return line;
  } catch {
    // Nothing that can be read is nothing shared: the page that says so, never a crash on the way in.
    return "";
  }
}

export function redirectSystemPath(event: { path: string; initial: boolean }): string | null {
  // The way back from a browser session (Google sign-in, a calendar consent) is read by the session waiting for it
  // (auth/return-link.ts), never routed: a screen for it would be the "unmatched route" page.
  const back = returnLink(event);
  if (back !== event.path) return back;
  const { to, quickAdd } = opening(event.path, takeShared);
  if (quickAdd) askForQuickAdd(quickAdd);
  return to;
}
