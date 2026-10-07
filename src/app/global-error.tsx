"use client";
// The last boundary (SCREENS.md §21 "Unexpected failure"): when the root itself fails, this replaces the whole
// document, so it brings its own <html>, <body> and styles and reads the chosen theme itself. Same panel, same plain
// words, Try again and Copy details — never a blank screen and never a stack trace. It rides in every shell, so it
// stays small: the panel is an island and the theme key is spelled out rather than imported.
import { useEffect } from "react";
import { BUILD_ID } from "@/data/build-id";
import { LazyErrorPanel } from "@/ui/error-panel-lazy";
import "./globals.css";

/** features/commands/theme.ts THEME_KEY: the theme a person chose on this device, if any. */
function chosenTheme(): "light" | "dark" | undefined {
  try {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem("sparehour.theme");
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
          <LazyErrorPanel
            eyebrow="Unexpected error"
            title="Sparehour stopped before it finished starting."
            body="Nothing you saved is lost: it is on this device and in your account. Try again, and if it happens again, Copy details helps us find it."
            onRetry={reset}
            details={{ what: "Sparehour stopped while starting.", error, build: BUILD_ID }}
          />
        </main>
      </body>
    </html>
  );
}
