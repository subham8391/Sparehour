// Install and persistence rules (SYSTEM_DESIGN.md §10.4–10.5), pure so the
// per-platform copy is tested without a device.

export interface InstallSignals {
  /** matchMedia('(display-mode: standalone)') or navigator.standalone */
  standalone: boolean;
  /** A captured `beforeinstallprompt` event is available (Android/desktop Chromium). */
  canPrompt: boolean;
  isIOS: boolean;
  /** An iPad, whose Safari keeps Share at the top rather than the bottom. */
  isIPad: boolean;
  isSafari: boolean;
}

export type InstallState =
  | { kind: "installed" }
  | { kind: "prompt" }
  | { kind: "coach-ios"; steps: string[] }
  | { kind: "coach-safari"; steps: string[] }
  | { kind: "browser-menu" };

/**
 * The Apple rule, said once wherever the coaching shows (ONBOARDING.md §After the reveal): on iPhone and iPad,
 * reminders and offline need the Home Screen app.
 */
export const APPLE_RULE = "Notifications and offline only work from the Home Screen — that’s an Apple rule, not ours.";

/**
 * ONBOARDING.md's three steps for Safari on iPhone and iPad. iOS 26's compact tab bar can tuck Share behind `···`,
 * so the first step names both (DECISIONS.md "iOS 26 install coaching"; to be checked on a real iPhone with A4).
 * iPad Safari keeps its toolbar at the top.
 */
export function iosInstallSteps(iPad = false): string[] {
  return [`Tap Share, or ··· then Share, at the ${iPad ? "top" : "bottom"} of Safari.`, "Scroll down and tap Add to Home Screen.", "Tap Add."];
}

/** What to show under "Install": nothing to do, a button, or the gesture for this platform. */
export function installState(s: InstallSignals): InstallState {
  if (s.standalone) return { kind: "installed" };
  if (s.canPrompt) return { kind: "prompt" };
  if (s.isIOS) return { kind: "coach-ios", steps: iosInstallSteps(s.isIPad) };
  if (s.isSafari) return { kind: "coach-safari", steps: ["Choose File → Add to Dock", "Open Sparehour from the Dock"] };
  return { kind: "browser-menu" };
}

export function detectInstallSignals(nav: Pick<Navigator, "userAgent"> & { standalone?: boolean }, standaloneMedia: boolean, canPrompt: boolean): InstallSignals {
  const ua = nav.userAgent;
  // iPadOS asks for the desktop site and says "Macintosh"; only a touch iPad has navigator.standalone there.
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && "standalone" in nav);
  const isIOS = /iPhone|iPod/.test(ua) || isIPad;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua);
  return { standalone: standaloneMedia || nav.standalone === true, canPrompt, isIOS, isIPad, isSafari };
}

export type PersistenceState = "protected" | "unprotected" | "unknown";

/** The line under Storage in Settings. */
export function persistenceCopy(state: PersistenceState, installed: boolean): string {
  switch (state) {
    case "protected":
      return "Your data is protected from automatic cleanup.";
    case "unprotected":
      return installed ? "Not protected yet — it will be once you use the app a little more." : "Not protected — install the app so your browser never clears it.";
    default:
      return "Checking whether this browser protects your data…";
  }
}

const ASKED_KEY = "sparehour.persist-asked";

/**
 * Asks the browser to exempt the origin from eviction, once, after the first
 * meaningful action (never on load — Chrome's heuristic likes engagement).
 * Resolves the resulting state.
 */
export async function requestPersistence(storage: Pick<StorageManager, "persist" | "persisted"> | undefined, memory: Pick<Storage, "getItem" | "setItem"> | null): Promise<PersistenceState> {
  if (!storage?.persisted) return "unknown";
  try {
    if (await storage.persisted()) return "protected";
    if (memory?.getItem(ASKED_KEY)) return "unprotected";
    memory?.setItem(ASKED_KEY, "1");
    const granted = storage.persist ? await storage.persist() : false;
    return granted ? "protected" : "unprotected";
  } catch {
    return "unknown";
  }
}
