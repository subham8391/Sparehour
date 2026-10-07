"use client";
// SCREENS.md §21 "Unexpected failure" for every screen inside the app: the sidebar and the tab bar stay, and the view
// that failed gives way, in place, to what happened in plain words with Try again and Copy details. Never a blank
// screen and never a stack trace. Try again re-renders the view from the local data (`reset`), which works offline.
// The panel itself is an island; this file rides in every app shell.
import { useEffect } from "react";
import { BUILD_ID } from "@/data/build-id";
import { LazyErrorPanel } from "@/ui/error-panel-lazy";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 sm:px-6 md:max-w-210 md:px-10 md:py-7">
      {/* "This screen stopped before it finished drawing.", inline (error-panel.tsx `boundaryWords`). */}
      <LazyErrorPanel kind="screen" error={error} build={BUILD_ID} onRetry={reset} />
    </main>
  );
}
