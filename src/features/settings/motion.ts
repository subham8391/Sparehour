// Settings › Appearance › Reduce motion (SCREENS.md §18; M1 gap rulings): a
// per-device choice like the theme, System (the default, the OS decides) or
// Reduce. Kept in localStorage and stamped on <html> as data-motion="reduce"
// before the first paint by the head script (features/commands/theme.ts
// THEME_BOOTSTRAP); globals.css and the motion-safe / motion-reduce variants
// read the attribute. Only Settings writes it, so this lives outside the shell.
import { MOTION_KEY } from "@/features/commands/theme";

export type MotionChoice = "system" | "reduce";
const MOTION_EVENT = "sparehour:motion";

/** This device's motion choice: what the head script stamped from storage. */
export function readMotion(): MotionChoice {
  if (typeof document === "undefined") return "system";
  return document.documentElement.dataset.motion === "reduce" ? "reduce" : "system";
}

/** Stamps the choice on `<html>` at once and keeps it for the next load. */
export function applyMotion(choice: MotionChoice): void {
  const root = document.documentElement;
  if (choice === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
  try {
    if (choice === "reduce") localStorage.setItem(MOTION_KEY, "reduce");
    else localStorage.removeItem(MOTION_KEY);
  } catch {
    // storage can be unavailable (private mode); the attribute still applies for this load
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** For `useSyncExternalStore`: a change made here or in another tab. */
export function subscribeMotion(onChange: () => void): () => void {
  const fromStorage = (e: StorageEvent) => {
    if (e.key !== MOTION_KEY) return;
    if (e.newValue === "reduce") document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
    onChange();
  };
  window.addEventListener(MOTION_EVENT, onChange);
  window.addEventListener("storage", fromStorage);
  return () => {
    window.removeEventListener(MOTION_EVENT, onChange);
    window.removeEventListener("storage", fromStorage);
  };
}
