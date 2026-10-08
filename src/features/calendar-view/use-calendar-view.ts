"use client";
// The Calendar's view state on this device: the remembered mode (calendar-mode.ts, which the keyboard layer sets),
// and the day the range is anchored on.
import { useEffect, useSyncExternalStore } from "react";
import { calendarModeKey, installedApp } from "@/features/commands/calendar-commands";
import { readCalendarMode, setCalendarMode, subscribeCalendarMode, type CalendarMode } from "./calendar-mode";

export function useCalendarMode(): CalendarMode {
  return useSyncExternalStore(subscribeCalendarMode, readCalendarMode, () => "week" as const);
}

/**
 * Cmd/Ctrl+1–3 while the Calendar is open (the registry's "Calendar: …" commands, calendar-commands.ts): in the
 * installed app only — a browser tab keeps them for its own tabs — and never from a text field or an open dialog.
 */
export function useCalendarModeKeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !installedApp()) return;
      const mode = calendarModeKey(e, isMac);
      if (!mode) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector("[role='dialog'][aria-modal='true']")) return;
      e.preventDefault();
      setCalendarMode(mode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

// ---- the day the range is anchored on, in the address (`/calendar?day=2026-10-09`), so a reload keeps it. Only the
// address changes, in place, as Today's day stepping does (features/today/day-address.ts).
const addressListeners = new Set<() => void>();

function subscribeAddress(listener: () => void): () => void {
  addressListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    addressListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const readDayParam = (): string | null => new URLSearchParams(window.location.search).get("day");

/** The `?day=` the Calendar is anchored on, as written; null for today. */
export function useCalendarDayParam(): string | null {
  return useSyncExternalStore(subscribeAddress, readDayParam, () => null);
}

/** Anchors the Calendar on `iso` (null: today), replacing the address in place. */
export function setCalendarDay(iso: string | null): void {
  const url = new URL(window.location.href);
  if (iso) url.searchParams.set("day", iso);
  else url.searchParams.delete("day");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  for (const l of addressListeners) l();
}
