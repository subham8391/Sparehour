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

/** The new worker once it has installed and waits, or null when there is none, it fails, or it takes longer than `ms`. */
export function whenInstalled(worker: ServiceWorker | null | undefined, ms: number): Promise<ServiceWorker | null> {
  if (!worker) return Promise.resolve(null);
  if (worker.state === "installed") return Promise.resolve(worker);
  return new Promise((resolve) => {
    const done = (w: ServiceWorker | null) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onState);
      resolve(w);
    };
    const onState = () => {
      if (worker.state === "installed") done(worker);
      else if (worker.state !== "installing") done(null);
    };
    const timer = setTimeout(() => done(null), ms);
    worker.addEventListener("statechange", onState);
  });
}

/**
 * Moves to the new version. The worker controlling this page precaches the app's pages, so a plain reload would open
 * this version again: the worker is asked to look for the new one first, and a new worker that has installed is told
 * to take over (the PWA provider reloads on its `controlling`). With no new worker (no worker at all, or nothing newer
 * on the server yet) it reloads. The fallback reload covers a worker that never answers.
 */
export async function moveToNewVersion({ waitMs = 15_000 }: { waitMs?: number } = {}): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  if (registration) {
    if (!registration.waiting && !registration.installing && registration.update) {
      await Promise.race([registration.update().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, waitMs))]);
    }
    const next = registration.waiting ?? (await whenInstalled(registration.installing, waitMs));
    if (next) {
      next.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => window.location.reload(), 4000);
      return;
    }
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
