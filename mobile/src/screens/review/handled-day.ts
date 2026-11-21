// The day this phone already answered or dismissed the review of carried-over tasks. On the web that memory is the
// host's own state for as long as the tab lives (features/rituals/carry-review-host.tsx, `handled`), covering the
// moment between the stamp on day_plans and its echo from the local database; a phone's app is closed and opened
// again all day, so the same memory is kept on the device (the pattern of today/use-device-value.ts), and the
// review can never open twice on one day whatever became of the stamp. It is kept per account, so the next person
// to sign in on this phone is still asked. Whether a review screen is open now is kept here too, for the host that
// opens it once (carry-review-host.tsx).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "sparehour:carry-review-handled";

/** What is remembered: the account and its day, as one word. */
export const handledToken = (userId: string | null | undefined, dayIso: string): string => `${userId ?? ""}:${dayIso}`;

export interface HandledDay {
  /** The phone's copy has been read (or cannot be): until then nothing opens by itself. */
  loaded: boolean;
  /** The last account-and-day handled here. */
  token: string | null;
  /** How many review screens are open now. */
  open: number;
}

let state: HandledDay = { loaded: false, token: null, open: 0 };
let asked = false;
const listeners = new Set<() => void>();

function set(next: Partial<HandledDay>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Reads the phone's copy once. A day handled before it answers stands. */
function ask(): void {
  if (asked) return;
  asked = true;
  AsyncStorage.getItem(KEY)
    .then((kept) => set({ loaded: true, token: state.token ?? kept }))
    // Where the phone's storage cannot be read, the memory lives for as long as the app does.
    .catch(() => set({ loaded: true }));
}

/** Remembers that this account's day was answered or dismissed, now and for the next launch. */
export function markHandled(token: string): void {
  if (state.token !== token) set({ token });
  AsyncStorage.setItem(KEY, token).catch(() => undefined);
}

/** A review screen came on; call what it returns when it goes. */
export function reviewOpened(): () => void {
  set({ open: state.open + 1 });
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    set({ open: Math.max(0, state.open - 1) });
  };
}

function subscribe(listener: () => void): () => void {
  ask();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const read = (): HandledDay => state;

export function useHandledDay(): HandledDay {
  return useSyncExternalStore(subscribe, read, read);
}

/** For tests: forget what this run read and marked. */
export function resetHandledDay(): void {
  state = { loaded: false, token: null, open: 0 };
  asked = false;
}
