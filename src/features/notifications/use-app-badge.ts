"use client";
// The app-icon badge (SCREENS.md §19): today's remaining planned count,
// neutral, only once notifications were allowed; cleared at zero.
import { useEffect } from "react";

export function useAppBadge(count: number): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    void (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
  }, [count]);
}
