// Install and persistence rules (SYSTEM_DESIGN.md §10.4–10.5), pure so the
// per-platform copy is tested without a device.

export interface InstallSignals {
  /** matchMedia('(display-mode: standalone)') or navigator.standalone */
  standalone: boolean;
  /** A captured `beforeinstallprompt` event is available (Android/desktop Chromium). */
  canPrompt: boolean;
  isIOS: boolean;
  isSafari: boolean;
}

export type InstallState =
  | { kind: "installed" }
  | { kind: "prompt" }
  | { kind: "coach-ios"; steps: string[] }
  | { kind: "coach-safari"; steps: string[] }
  | { kind: "browser-menu" };

/** What to show under "Install": nothing to do, a button, or the gesture for this platform. */
export function installState(s: InstallSignals): InstallState {
  if (s.standalone) return { kind: "installed" };
  if (s.canPrompt) return { kind: "prompt" };
  if (s.isIOS) return { kind: "coach-ios", steps: ["Tap Share in Safari", "Choose “Add to Home Screen”", "Open Sparehour from your Home Screen"] };
  if (s.isSafari) return { kind: "coach-safari", steps: ["Choose File → Add to Dock", "Open Sparehour from the Dock"] };
  return { kind: "browser-menu" };
}

export function detectInstallSignals(nav: Pick<Navigator, "userAgent"> & { standalone?: boolean }, standaloneMedia: boolean, canPrompt: boolean): InstallSignals {
  const ua = nav.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "standalone" in nav);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua);
  return { standalone: standaloneMedia || nav.standalone === true, canPrompt, isIOS, isSafari };
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
