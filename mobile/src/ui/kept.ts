// A choice this phone keeps for itself between launches (the theme, the look, reduce motion): the phone's twin of
// the web's copies in the browser's storage (../../../src/features/commands/theme.ts, looks/look.ts,
// settings/motion.ts). It is held in memory, so every reader has it at once and a change redraws at once, and kept in
// the device's key-value store, so the next cold start draws it from the first frame (`ready`, which ui/fonts.ts
// waits for behind the splash). It stays through Sign out, as the browser's copy does.
import { useSyncExternalStore } from "react";

interface Store {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let store: Store | null | undefined;
/**
 * The device's key-value store, asked for when first needed. Its module throws as it loads where the native half is
 * missing (a test that does not stand in for it): a choice then simply lasts until the app closes.
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

export interface Kept<T extends string> {
  get: () => T;
  /** Shows the choice now and keeps it for the next launch. */
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
  /** Resolves once the device's copy has been read, or could not be: nothing kept reads as the default. */
  ready: () => Promise<void>;
  /** For tests: forget what this run read and chose. */
  reset: () => void;
}

/**
 * One kept choice. `read` turns what the device kept into a choice, or null for anything it does not know (the
 * default then stands); the default itself is never stored. `shown` is told every time the choice on screen changes.
 */
export function kept<T extends string>(key: string, fallback: T, read: (kept: string) => T | null, shown?: (next: T) => void): Kept<T> {
  let choice: T = fallback;
  /** The device has been read, or a choice was made before it answered (which then stands). */
  let settled = false;
  let asking: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const show = (next: T) => {
    choice = next;
    shown?.(next);
    listeners.forEach((l) => l());
  };

  /** Reads the kept choice once; a missing store answers the default. */
  const ready = (): Promise<void> => {
    if (asking) return asking;
    const reading = storage()?.getItem(key);
    if (!reading) {
      settled = true;
      return (asking = Promise.resolve());
    }
    return (asking = reading
      .then((value) => {
        if (settled) return;
        settled = true;
        const known = value === null ? null : read(value);
        if (known !== null && known !== choice) show(known);
      })
      .catch(() => undefined));
  };

  return {
    get: () => choice,
    set: (next) => {
      settled = true;
      if (next !== choice) show(next);
      const s = storage();
      if (s) void (next === fallback ? s.removeItem(key) : s.setItem(key, next)).catch(() => undefined);
    },
    subscribe: (listener) => {
      void ready();
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    ready,
    reset: () => {
      choice = fallback;
      settled = false;
      asking = null;
      store = undefined;
    },
  };
}

/** A kept choice as a hook: the component redraws when it changes. */
export function useKept<T extends string>(choice: Kept<T>): T {
  return useSyncExternalStore(choice.subscribe, choice.get, choice.get);
}
