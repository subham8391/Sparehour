"use client";
// "Update required" (SYSTEM_DESIGN.md §10.2): the one forced update. When
// GET /api/bootstrap says this build is below min_client_version, the app is
// blocked by this screen, lets the changes still waiting on this device upload
// first, then moves to the new version (the service worker is asked for the
// new one, which takes over; with none, a reload fetches the new pages).
// Nothing is lost if the upload cannot finish: the queue lives in the local
// database and the new version sends it. A reload that lands on the old version again does not loop:
// the screen then says to close and reopen Sparehour, with a Reload button.
// A lazy island: it loads only when the gate closes.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { Button } from "@/ui/button";
import { EYEBROW } from "@/ui/section-label";

type Queue = Pick<LocalDatabase, "getUploadQueueStats">;

/** How long the uploads get before the update goes ahead anyway (they survive the reload). */
export const FLUSH_TIMEOUT_MS = 20_000;
const TRIED_KEY = "sparehour.forced-update";
/** A reload for the same gate this recently that still came back old is a loop, not progress. */
const RETRY_WINDOW_MS = 2 * 60_000;

/**
 * Waits while changes are still queued for upload — the connector sends them by itself — until none are left, the
 * time is up, or the device goes offline. Resolves how many are still waiting.
 */
export async function flushUploads(
  db: Queue | null,
  { timeoutMs = FLUSH_TIMEOUT_MS, intervalMs = 400, online = () => (typeof navigator === "undefined" ? true : navigator.onLine), onCount }: { timeoutMs?: number; intervalMs?: number; online?: () => boolean; onCount?: (n: number) => void } = {},
): Promise<number> {
  if (!db) return 0;
  const until = Date.now() + timeoutMs;
  const read = async () => (await db.getUploadQueueStats().catch(() => ({ count: 0 }))).count;
  let count = await read();
  onCount?.(count);
  while (count > 0 && online() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    count = await read();
    onCount?.(count);
  }
  return count;
}

type Memory = Pick<Storage, "getItem" | "setItem">;

function session(): Memory | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Whether this tab already reloaded for this gate a moment ago and is still old. */
export function triedRecently(min: string, memory: Memory | null, now = Date.now()): boolean {
  try {
    const raw = memory?.getItem(TRIED_KEY);
    if (!raw) return false;
    const { min: was, at } = JSON.parse(raw) as { min?: string; at?: number };
    return was === min && typeof at === "number" && now - at < RETRY_WINDOW_MS;
  } catch {
    return false;
  }
}

export function markTried(min: string, memory: Memory | null, now = Date.now()): void {
  try {
    memory?.setItem(TRIED_KEY, JSON.stringify({ min, at: now }));
  } catch {
    // a private window without session storage just risks one more reload
  }
}

type Phase = "saving" | "updating" | "stuck";

export default function UpdateRequired({ min, applyUpdate }: { min: string; applyUpdate: () => void }) {
  const db = useLocalDatabase() as Queue | null;
  const [phase, setPhase] = useState<Phase>(() => (triedRecently(min, session()) ? "stuck" : "saving"));
  const [left, setLeft] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The app behind is out of reach: nothing in it can be focused or clicked, and its shortcuts do not fire.
  useEffect(() => {
    const others = Array.from(document.body.children).filter((el) => !el.hasAttribute("data-update-required"));
    const before = others.map((el) => el.hasAttribute("inert"));
    for (const el of others) el.setAttribute("inert", "");
    const swallow = (e: KeyboardEvent) => {
      if (!(e.target instanceof Element && e.target.closest("[data-update-required]"))) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", swallow, true);
    heading.current?.focus();
    return () => {
      others.forEach((el, i) => el.toggleAttribute("inert", before[i]));
      window.removeEventListener("keydown", swallow, true);
    };
  }, []);

  useEffect(() => {
    if (phase !== "saving") return;
    let live = true;
    void flushUploads(db, { onCount: (n) => live && setLeft(n) }).then(() => {
      if (!live) return;
      setPhase("updating");
      markTried(min, session());
      applyUpdate();
    });
    return () => {
      live = false;
    };
  }, [phase, db, min, applyUpdate]);

  // Reload asks for the new version the same way (a new service worker takes over when there is one), not a plain
  // reload, which the worker controlling this page would answer with this version again.
  const retry = () => {
    setPhase("updating");
    markTried(min, session());
    heading.current?.focus();
    applyUpdate();
  };

  const line =
    phase === "stuck"
      ? "It opened the old version again. Close Sparehour completely, then open it again."
      : phase === "updating"
        ? "Updating…"
        : left
          ? `Saving your changes first — ${left === 1 ? "1 change" : `${left} changes`} still to upload.`
          : "Saving your changes first…";

  return createPortal(
    <div data-update-required="" role="alertdialog" aria-modal="true" aria-labelledby="update-required-title" aria-describedby="update-required-line" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-paper px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-4">
        <p className={EYEBROW}>Sparehour</p>
        <h1 id="update-required-title" ref={heading} tabIndex={-1} className="font-display text-title font-book text-balance text-ink focus:outline-none">
          Update required
        </h1>
        <p className="text-body-lg text-pretty text-ink-2">This version is too old to stay in step with your account. Nothing you’ve done is lost.</p>
        <p id="update-required-line" role="status" className="text-body text-pretty text-ink-2">
          {line}
        </p>
        {phase === "stuck" && (
          <Button variant="primary" onClick={retry} className="self-start">
            Reload
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}
