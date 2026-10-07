"use client";
// The forced update's check (SYSTEM_DESIGN.md §10.2): GET /api/bootstrap at
// start and whenever the app comes back into view (at most twice an hour);
// when its min_client_version is above this build, "Update required" closes
// over the app. An island the PWA provider fetches once the browser is idle,
// so no shell carries it; a development build ("dev") is never gated and never
// asks.
import { useEffect, useState } from "react";
import { BUILD_ID } from "@/data/build-id";
import UpdateRequired from "./update-required";
import { fetchBootstrap, isUpdateRequired } from "./version";

/** How often an open, visible app asks again. */
export const GATE_EVERY_MS = 30 * 60_000;

/**
 * Moves to the new version: a waiting service worker is told to take over (the PWA provider reloads on its
 * `controlling`), else a reload fetches the new pages, which are network-first. The fallback reload covers a worker
 * that never answers.
 */
export async function moveToNewVersion(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), 4000);
    return;
  }
  window.location.reload();
}

const applyUpdate = () => void moveToNewVersion();

export default function VersionGate() {
  const [gate, setGate] = useState<string | null>(null);
  useEffect(() => {
    if (!/\d/.test(BUILD_ID)) return;
    let live = true;
    let last = 0;
    const check = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < GATE_EVERY_MS) return;
      last = Date.now();
      void fetchBootstrap().then((b) => {
        if (live && b && isUpdateRequired(BUILD_ID, b.min_client_version)) setGate(b.min_client_version);
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return gate ? <UpdateRequired min={gate} applyUpdate={applyUpdate} /> : null;
}
