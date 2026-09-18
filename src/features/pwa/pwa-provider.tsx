"use client";
// Everything "app-like" (SYSTEM_DESIGN.md §10): whether we are installed and
// how to install here, storage persistence (asked once, after the first
// meaningful action), and the update flow — a new version waits until the
// person chooses to reload.
import { Serwist } from "@serwist/window";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { detectInstallSignals, installState, requestPersistence, type InstallState, type PersistenceState } from "./install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaApi {
  install: InstallState;
  persistence: PersistenceState;
  /** Ask the browser to keep our storage; safe to call often, asks once. */
  requestPersist: () => void;
  /** Show the browser's install prompt (only when `install.kind === "prompt"`). */
  promptInstall: () => Promise<void>;
  updateReady: boolean;
  reloadToUpdate: () => void;
}

const PwaContext = createContext<PwaApi | null>(null);

export function usePwa(): PwaApi {
  const api = useContext(PwaContext);
  if (!api) throw new Error("usePwa needs a PwaProvider above it");
  return api;
}

/** null outside the provider, so components stay usable in isolation. */
export function usePwaOptional(): PwaApi | null {
  return useContext(PwaContext);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [persistence, setPersistence] = useState<PersistenceState>("unknown");
  const [updateReady, setUpdateReady] = useState(false);
  const workerRef = useRef<Serwist | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => setStandalone(media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    sync();
    media.addEventListener("change", sync);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Report what the browser already decided, without asking yet.
    navigator.storage?.persisted?.().then((p) => setPersistence(p ? "protected" : "unknown")).catch(() => {});
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The update flow (§10.2): register the worker (production builds only —
  // in development there is no sw.js), notice a waiting version, and reload
  // only when the person asks.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const worker = new Serwist("/sw.js", { scope: "/", type: "classic" });
    workerRef.current = worker;
    worker.addEventListener("waiting", () => setUpdateReady(true));
    worker.addEventListener("controlling", (event) => {
      if (event.isUpdate) window.location.reload();
    });
    void worker.register();
    return () => {
      workerRef.current = null;
    };
  }, []);

  const requestPersist = useCallback(() => {
    void requestPersistence(navigator.storage, safeStorage()).then(setPersistence);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  }, [prompt]);

  const reloadToUpdate = useCallback(() => {
    workerRef.current?.messageSkipWaiting();
  }, []);

  const install = useMemo(() => installState(detectInstallSignals(navigator, standalone, prompt !== null)), [standalone, prompt]);
  const api = useMemo<PwaApi>(
    () => ({ install, persistence, requestPersist, promptInstall, updateReady, reloadToUpdate }),
    [install, persistence, requestPersist, promptInstall, updateReady, reloadToUpdate],
  );

  return (
    <PwaContext.Provider value={api}>
      {children}
      {updateReady && (
        // The toast (DESIGN_SYSTEM.md §5): an ink object with its action as a text button; the ring inverts with it.
        <div role="status" className="fixed inset-x-4 top-3 z-40 mx-auto flex h-11 max-w-md items-center gap-3 rounded-lg bg-ink pr-1.5 pl-4 text-body font-medium text-ink-inverse shadow-raised">
          <span className="min-w-0 flex-1 truncate">A new version is ready.</span>
          <button type="button" onClick={reloadToUpdate} className="flex h-8 shrink-0 items-center rounded-sm px-2 font-semibold text-ink-inverse transition-colors dur-fast hover:bg-ink-inverse/15 focus-visible:outline-ink-inverse active:bg-ink-inverse/25">
            Reload
          </button>
        </div>
      )}
    </PwaContext.Provider>
  );
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
