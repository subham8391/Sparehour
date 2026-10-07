"use client";
// When this device's storage will not open (SYSTEM_DESIGN.md §10.3 "Private
// browsing"; ruled 2026-10-06: no in-memory fallback at M1): the inline error
// state of SCREENS.md §21 — what happened in plain words, Try again and Copy
// details — never a blank screen and never a stack trace. A private window is
// the usual cause: Firefox's keeps the origin private file system shut, and
// Safari's can refuse it too. Everything is still safe in the account.
// A lazy island: it loads only when the database failed to open.
import { useState } from "react";
import { BUILD_ID } from "@/data/build-id";
import { Button } from "@/ui/button";
import { EYEBROW } from "@/ui/section-label";

/** What Copy details puts on the clipboard: the error's name and message, the build and the browser — nothing personal. */
export function storageErrorDetails(error: unknown, build: string, userAgent: string, at: Date): string {
  const what = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return [`Sparehour couldn’t open this device’s storage.`, `Error: ${what.slice(0, 500)}`, `Version: ${build}`, `Browser: ${userAgent}`, `When: ${at.toISOString()}`].join("\n");
}

export default function StorageError({ error }: { error: unknown }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const [details, setDetails] = useState("");
  const copy = async () => {
    const text = storageErrorDetails(error, BUILD_ID, navigator.userAgent, new Date());
    setDetails(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8 sm:px-5">
      <p className={EYEBROW}>Storage</p>
      <h1 className="font-display text-title font-book text-balance text-ink">Sparehour can’t open its storage in this window.</h1>
      <p className="text-body-lg text-pretty text-ink-2">Private windows often keep it shut. Open Sparehour in a normal window, or try again. Everything is safe in your account.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Button variant="secondary" onClick={() => void copy()}>
          Copy details
        </Button>
      </div>
      <p role="status" className="text-body-sm text-pretty text-ink-2">
        {copied === "yes" ? "Copied." : copied === "no" ? "Couldn’t copy — here they are:" : ""}
      </p>
      {copied === "no" && <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-label whitespace-pre-wrap text-ink-2 select-all">{details}</pre>}
    </main>
  );
}
