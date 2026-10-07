"use client";
// When this device's storage will not open (SYSTEM_DESIGN.md §10.3 "Private
// browsing"; ruled 2026-10-06: no in-memory fallback at M1): the inline error
// state of SCREENS.md §21 — what happened in plain words, Try again and Copy
// details — never a blank screen and never a stack trace. A private window is
// the usual cause: Firefox's keeps the origin private file system shut, and
// Safari's can refuse it too. Everything is still safe in the account.
// A lazy island: it loads only when the database failed to open.
import { BUILD_ID } from "@/data/build-id";
import { ErrorPanel, errorDetails } from "@/ui/error-panel";

const WHAT = "Sparehour couldn’t open this device’s storage.";

/** What Copy details puts on the clipboard: the error's name and message, the build and the browser — nothing personal. */
export function storageErrorDetails(error: unknown, build: string, userAgent: string, at: Date): string {
  return errorDetails({ what: WHAT, error, build, userAgent, at });
}

export default function StorageError({ error }: { error: unknown }) {
  return (
    <main className="flex w-full flex-col">
      <ErrorPanel
        eyebrow="Storage"
        title="Sparehour can’t open its storage in this window."
        body="Private windows often keep it shut. Open Sparehour in a normal window, or try again. Everything is safe in your account."
        onRetry={() => window.location.reload()}
        details={{ what: WHAT, error, build: BUILD_ID }}
      />
    </main>
  );
}
