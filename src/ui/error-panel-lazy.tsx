"use client";
// The error panel as an island: the boundaries are in every shell's first download, the panel only arrives when
// something has failed. While it loads — or if it cannot load at all — the place still says what happened in plain
// words with a way out, so a failure is never a blank screen (SCREENS.md §21). React's own `lazy` rather than
// next/dynamic: the root's global-error sits in a chunk of its own, where next/dynamic's runtime would ride again.
import { Suspense, lazy, type ComponentType } from "react";
import type { ErrorPanelProps } from "./error-panel";

function Interim() {
  return (
    <p role="status" className="px-4 py-5 text-body-lg text-pretty text-ink-2">
      This part of Sparehour stopped before it finished drawing. Nothing you saved is lost.{" "}
      <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 sm:min-h-0">
        Reload
      </button>
    </p>
  );
}

const Panel = lazy<ComponentType<ErrorPanelProps>>(() => import("./error-panel").then((m) => ({ default: m.ErrorPanel }), () => ({ default: Interim })));

export function LazyErrorPanel(props: ErrorPanelProps) {
  return (
    <Suspense fallback={<Interim />}>
      <Panel {...props} />
    </Suspense>
  );
}
