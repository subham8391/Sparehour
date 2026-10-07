// Where this device left the first run: once the hours are confirmed, a reload or a reopen goes straight back to
// the brain dump (ONBOARDING.md step 3) rather than asking about the hours again. Keyed by the account, so a second
// person signing in on the device starts at the beginning. Storage that cannot be read just means step 1b again.
const KEY = "sparehour.first-run.hours";

export function hoursConfirmedHere(userId: string): boolean {
  try {
    return window.localStorage.getItem(KEY) === userId;
  } catch {
    return false;
  }
}

export function rememberHoursConfirmed(userId: string): void {
  try {
    window.localStorage.setItem(KEY, userId);
  } catch {
    // Private browsing or blocked storage: a reload asks about the hours once more, nothing else.
  }
}

export function forgetFirstRun(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
