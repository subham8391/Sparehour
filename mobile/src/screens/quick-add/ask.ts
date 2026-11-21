// A way to ask for quick add from where there is no screen: the address the app is opened with (share/native-intent.ts
// reads it before anything is drawn) when it is the icon's "Add a task" shortcut, or what another app shared. The ask
// waits here until the sheet's provider is up (after sign-in, once the phone's own copy is open) and is answered
// once, as the web takes `?quickadd=1` off the address when its sheet opens. Nothing here knows the sheet.

export interface QuickAddAsk {
  /** What the box opens holding (what was shared, as one line); left out, it opens empty. */
  text?: string;
}

let waiting: QuickAddAsk | null = null;
const listeners = new Set<() => void>();

/** Asks for the sheet. A second ask before the first is answered takes its place: the latest is what was meant. */
export function askForQuickAdd(ask: QuickAddAsk = {}): void {
  waiting = ask;
  for (const listener of [...listeners]) listener();
}

/** The ask that is waiting, taken: the next call finds none. */
export function takeQuickAddAsk(): QuickAddAsk | null {
  const ask = waiting;
  waiting = null;
  return ask;
}

/** Calls `listener` whenever an ask arrives; returns the way to stop. */
export function onQuickAddAsk(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
