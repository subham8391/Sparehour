// One round trip through the system browser (expo-web-browser's auth session): open an address, wait for the
// browser to come back to one of the app's own links, hand over what the link carried. A Google sign-in and a
// calendar consent both run through it. The browser is the phone's own (a Custom Tab on Android), not a web view
// inside the app: the person sees the real address, uses the accounts already signed in there, and the app never
// sees a password.
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { readReturnLink } from "./return-link";

export type BrowserReturn =
  /** The browser came back to the link; `params` is what it carried (untrusted: see return-link.ts). */
  | { type: "returned"; params: Record<string, string> }
  /** The person closed the browser, or it never came back to the link. */
  | { type: "closed" };

/**
 * On Android the session ends on whichever comes first, the link or the app coming back to the front, and the
 * second can win by a moment even when the link is on its way. So the link is listened for here as well, and a
 * session that looks closed waits this long for it before it is called closed.
 */
export const RETURN_GRACE_MS = 400;

export interface BrowserSessionDeps {
  open: (startUrl: string, returnLink: string) => Promise<{ type: string; url?: string }>;
  listen: (onUrl: (url: string) => void) => { remove: () => void };
  wait: (ms: number) => Promise<void>;
}

const real: BrowserSessionDeps = {
  open: (startUrl, returnLink) => WebBrowser.openAuthSessionAsync(startUrl, returnLink),
  listen: (onUrl) => Linking.addEventListener("url", (event) => onUrl(event.url)),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function browserSession(startUrl: string, returnLink: string, deps: BrowserSessionDeps = real): Promise<BrowserReturn> {
  let seen: string | null = null;
  let arrived: (() => void) | null = null;
  const listening = deps.listen((url) => {
    if (readReturnLink(url, returnLink) === null) return;
    seen = url;
    arrived?.();
  });
  try {
    const result = await deps.open(startUrl, returnLink);
    let url: string | null = result.type === "success" && typeof result.url === "string" ? result.url : seen;
    if (url === null) {
      await Promise.race([new Promise<void>((resolve) => (arrived = resolve)), deps.wait(RETURN_GRACE_MS)]);
      url = seen;
    }
    // Read strictly: the session matches by prefix, this by the whole address before the `?`.
    const params = url === null ? null : readReturnLink(url, returnLink);
    return params ? { type: "returned", params } : { type: "closed" };
  } finally {
    listening.remove();
  }
}
