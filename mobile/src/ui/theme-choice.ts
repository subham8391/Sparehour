// This phone's own choice of theme (SCREENS.md §18 Appearance: Light, Dark or System). Like the web's copy in the
// browser's storage (../../../src/features/commands/theme.ts) it is kept on the device, not in the account, and
// stays through Sign out: System, the default, follows the phone's own setting; Light and Dark hold whatever the
// phone says. `useScheme()` in theme.ts reads it, so every colour follows at once; the phone is told too
// (Appearance.setColorScheme), so the status bar, the keyboard and the system's own dialogs match.
import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "sparehour.theme";

interface Store {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let store: Store | null | undefined;
/**
 * The device's key-value store, asked for when first needed. Its module throws as it loads where the native half is
 * missing (a test that does not stand in for it): the choice then simply lasts until the app closes.
 */
function storage(): Store | null {
  if (store !== undefined) return store;
  try {
    // A require, not an import at the top: a missing native module is then caught here, not as this file loads.
    store = (require("@react-native-async-storage/async-storage") as { default: Store }).default ?? null;
  } catch {
    store = null;
  }
  return store;
}

let choice: ThemeChoice = "system";
/** The device has been read, or a choice was made before it answered (which then stands). */
let settled = false;
let asked = false;
const listeners = new Set<() => void>();

/** Tells the phone, so what the app does not draw itself follows: "unspecified" hands the choice back to the system. */
function tellPhone(next: ThemeChoice): void {
  try {
    Appearance.setColorScheme?.(next === "system" ? "unspecified" : next);
  } catch {
    // Not every platform can be told (the browser preview); the app's own colours follow regardless.
  }
}

function show(next: ThemeChoice): void {
  choice = next;
  tellPhone(next);
  listeners.forEach((l) => l());
}

/** Reads the kept choice once; nothing is drawn differently until it answers, and a missing store answers System. */
function ask(): void {
  if (asked) return;
  asked = true;
  const reading = storage()?.getItem(KEY);
  if (!reading) {
    settled = true;
    return;
  }
  void reading
    .then((kept) => {
      if (settled) return;
      settled = true;
      if (kept === "light" || kept === "dark") show(kept);
    })
    .catch(() => undefined);
}

export function themeChoice(): ThemeChoice {
  return choice;
}

/** Shows the choice now and keeps it for the next launch. */
export function setThemeChoice(next: ThemeChoice): void {
  settled = true;
  if (next !== choice) show(next);
  const s = storage();
  if (s) void (next === "system" ? s.removeItem(KEY) : s.setItem(KEY, next)).catch(() => undefined);
}

export function subscribeThemeChoice(listener: () => void): () => void {
  ask();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeThemeChoice, themeChoice, themeChoice);
}

/** For tests: forget what this run read and chose. */
export function resetThemeChoice(): void {
  choice = "system";
  settled = false;
  asked = false;
  store = undefined;
}
