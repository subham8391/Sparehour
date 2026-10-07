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

export default function VersionGate({ applyUpdate }: { applyUpdate: () => void }) {
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
