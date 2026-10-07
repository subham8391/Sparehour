"use client";
// The last boundary (SCREENS.md §21 "Unexpected failure"): when the root itself fails, this replaces the whole
// document, so it brings its own <html>, <body> and styles and reads the chosen theme itself. Same panel, same plain
// words, Try again and Copy details — never a blank screen and never a stack trace.
import { useEffect } from "react";
import { BUILD_ID } from "@/data/build-id";
import { THEME_KEY } from "@/features/commands/theme";
import { ErrorPanel, errorDetails } from "@/ui/error-panel";
import "./globals.css";

function chosenTheme(): "light" | "dark" | undefined {
  try {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : undefined;
  } catch {
    return undefined;
  }
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" data-theme={chosenTheme()} className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <title>Sparehour</title>
        <main className="flex w-full flex-col">
          <ErrorPanel
            eyebrow="Unexpected error"
            title="Sparehour stopped before it finished starting."
            body="Nothing you saved is lost: it is on this device and in your account. Try again, and if it happens again, Copy details helps us find it."
            onRetry={reset}
            details={() => errorDetails({ what: "Sparehour stopped while starting.", error, build: BUILD_ID, userAgent: navigator.userAgent, at: new Date() })}
          />
        </main>
      </body>
    </html>
  );
}
