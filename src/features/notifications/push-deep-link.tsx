"use client";
// The shell's end of a notification tap (SYSTEM_DESIGN.md §7.1, §7.3). What
// a tap does, and the action sheet, live in push-actions.tsx, an island
// (the shells' 320 KB budget): fetched in idle time, or at once when the
// page was opened from a notification, and kept mounted from then on so the
// sheet outlives the URL being cleaned.
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useIdleMount } from "@/features/shell/preload-on-idle";

const loadHandler = () => import("./push-actions");
const DeepLinkHandler = dynamic(() => loadHandler().then((m) => m.DeepLinkHandler), { ssr: false });

/** True when the URL came from a notification: the `src=push` marker parseDeepLink (push.ts) starts from. */
export function fromNotification(params: Pick<URLSearchParams, "get">): boolean {
  return params.get("src") === "push";
}

export function PushDeepLink() {
  return (
    <Suspense>
      <DeepLinkIsland />
    </Suspense>
  );
}

function DeepLinkIsland() {
  const params = useSearchParams();
  return useIdleMount(loadHandler, fromNotification(params)) ? <DeepLinkHandler /> : null;
}
