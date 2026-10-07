"use client";
// The error panel as an island: the boundaries are in every shell's first download, the panel only arrives when
// something has failed. While it loads — or if it cannot load at all — the place still says what happened in plain
// words with a way out, so a failure is never a blank screen (SCREENS.md §21).
import dynamic from "next/dynamic";

function Interim() {
  return (
    <p role="status" className="px-4 py-5 text-body-lg text-pretty text-ink-2">
      This part of Sparehour stopped before it finished drawing. Nothing you saved is lost.{" "}
      <button type="button" onClick={() => window.location.reload()} className="font-medium text-ink underline decoration-line-strong underline-offset-2">
        Reload
      </button>
    </p>
  );
}

export const LazyErrorPanel = dynamic(() => import("./error-panel"), { ssr: false, loading: Interim });
