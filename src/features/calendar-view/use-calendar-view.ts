"use client";
// The Calendar's view state on this device: the remembered mode (calendar-mode.ts, which the keyboard layer sets),
// and the day the range is anchored on.
import { useSyncExternalStore } from "react";
import { readCalendarMode, subscribeCalendarMode, type CalendarMode } from "./calendar-mode";

export function useCalendarMode(): CalendarMode {
  return useSyncExternalStore(subscribeCalendarMode, readCalendarMode, () => "week" as const);
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
