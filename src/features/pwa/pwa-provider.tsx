"use client";
// Everything "app-like" (SYSTEM_DESIGN.md §10): whether we are installed and
// how to install here, storage persistence (asked once, after the first
// meaningful action), and the update flow — a new version waits until the
// person chooses to reload, unless /api/bootstrap says this build is below the
// oldest one allowed: then "Update required" blocks the app, lets pending
// uploads go and moves to the new version (§10.2).
import { Serwist } from "@serwist/window";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button";
import { Toast } from "@/ui/toast";
import { detectInstallSignals, installState, requestPersistence, type InstallState, type PersistenceState } from "./install";
import { useIdleMount } from "@/features/shell/preload-on-idle";

// The forced update's check and its blocking screen are an island fetched once the browser is idle.
const loadVersionGate = () => import("./version-gate");
const VersionGate = dynamic(loadVersionGate, { ssr: false });
// The phone's bars follow the look and theme (system-bars.tsx): set in idle time, after the pre-paint script's first guess.
const loadSystemBars = () => import("./system-bars");
const SystemBars = dynamic(loadSystemBars, { ssr: false });

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaApi {
  install: InstallState;
  persistence: PersistenceState;
  /** Ask the browser to keep our storage; safe to call often, asks once — or again with `again` (installed, notifications allowed). */
  requestPersist: (again?: boolean) => void;
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
    // Installed: the browser now weighs the origin differently, so ask again and let the status line follow (§10.4).
    const onInstalled = () => {
      setPrompt(null);
      void requestPersistence(navigator.storage, safeStorage(), true).then(setPersistence);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Report what the browser already decided, without asking yet.
    // Not persisted yet is "not protected" (PRODUCT_SPEC.md §19.2.2), not "checking": the answer is already in.
    navigator.storage?.persisted?.().then((p) => setPersistence(p ? "protected" : "unprotected")).catch(() => {});
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
    // Blocked by policy or a private window: the app works without it, so no uncaught error on every load.
    worker.register().catch(() => {});
    return () => {
      workerRef.current = null;
    };
  }, []);

  const gateMounted = useIdleMount(loadVersionGate, false);
  const barsMounted = useIdleMount(loadSystemBars, false);

  const requestPersist = useCallback((again = false) => {
    void requestPersistence(navigator.storage, safeStorage(), again).then(setPersistence);
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
      {gateMounted && <VersionGate />}
      {barsMounted && <SystemBars />}
      {updateReady && (
        // The one toast surface (DESIGN_SYSTEM.md §5): raised on surface-3 with one quiet action.
        <Toast
          action={
            <Button variant="quiet" className="px-3" onClick={reloadToUpdate}>
              Reload
            </Button>
          }
        >
          A new version is ready.
        </Toast>
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
