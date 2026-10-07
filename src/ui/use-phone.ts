"use client";
// Whether the screen is in the phone band (< 640 px, DESIGN_SYSTEM.md §4a), for the few places where the phone
// is a different structure rather than a different style (Today's This Evening starts collapsed there). False
// on the server and in the first hydrated render, then the real answer.
import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 39.9375rem)";
const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const read = () => typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches;

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
