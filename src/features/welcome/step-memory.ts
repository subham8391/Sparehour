// Where this device left the first run: once the hours are confirmed, a reload or a reopen goes straight back to
// the brain dump (ONBOARDING.md step 3) rather than asking about the hours again. Keyed by the account, so a second
// person signing in on the device starts at the beginning. Storage that cannot be read just means step 1b again.
// The calendar step (ONBOARDING.md step 2) is remembered the same way once it is answered, by a connection or by
// "Skip for now", so it is offered once and never asks again on a reload.
// The two keys are the Android app's too: it keeps the same answers under them in the phone's own storage.
export const HOURS_KEY = "sparehour.first-run.hours";
export const CALENDAR_KEY = "sparehour.first-run.calendar";
const KEY = HOURS_KEY;

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

export function calendarAnsweredHere(userId: string): boolean {
  try {
    return window.localStorage.getItem(CALENDAR_KEY) === userId;
  } catch {
    return false;
  }
}

export function rememberCalendarAnswered(userId: string): void {
  try {
    window.localStorage.setItem(CALENDAR_KEY, userId);
  } catch {
    // Blocked storage: a reload offers the calendar once more, nothing else.
  }
}

export function forgetFirstRun(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(CALENDAR_KEY);
  } catch {
    // Nothing to forget.
  }
}
