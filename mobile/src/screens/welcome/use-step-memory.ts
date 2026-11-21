// Where this phone left the first run (the web's is features/welcome/step-memory.ts, in the browser's storage): once
// the hours are confirmed, closing the app and opening it again goes straight back to where it was rather than ask
// about the hours again; the calendar step is remembered the same way once it is answered. The same two keys, in the
// phone's own storage, keyed by the account, so a second person signing in on the phone starts at the beginning.
// Storage that cannot be read just means step 1b again. Unlike the browser's, the phone's storage answers a moment
// later: `read` is false until it has.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { CALENDAR_KEY, HOURS_KEY } from "@/features/welcome/step-memory";

export interface StepMemory {
  /** The phone's storage has answered (or could not): until then nothing is known about earlier steps. */
  read: boolean;
  hoursConfirmed: boolean;
  calendarAnswered: boolean;
  rememberHours: () => void;
  rememberCalendar: () => void;
  /** The first run is over: nothing is kept. */
  forget: () => void;
}

export function useStepMemory(userId: string | null | undefined): StepMemory {
  const [state, setState] = useState<{ for: string; hours: boolean; calendar: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    Promise.all([AsyncStorage.getItem(HOURS_KEY), AsyncStorage.getItem(CALENDAR_KEY)]).then(
      ([hours, calendar]) => live && setState((s) => ({ for: userId, hours: hours === userId || (s?.for === userId && s.hours), calendar: calendar === userId || (s?.for === userId && s.calendar) })),
      () => live && setState((s) => (s?.for === userId ? s : { for: userId, hours: false, calendar: false })),
    );
    return () => {
      live = false;
    };
  }, [userId]);
  const mine = state && state.for === userId ? state : null;
  const rememberHours = useCallback(() => {
    if (!userId) return;
    setState((s) => ({ for: userId, hours: true, calendar: s?.for === userId ? s.calendar : false }));
    AsyncStorage.setItem(HOURS_KEY, userId).catch(() => undefined);
  }, [userId]);
  const rememberCalendar = useCallback(() => {
    if (!userId) return;
    setState((s) => ({ for: userId, hours: s?.for === userId ? s.hours : false, calendar: true }));
    AsyncStorage.setItem(CALENDAR_KEY, userId).catch(() => undefined);
  }, [userId]);
  const forget = useCallback(() => {
    AsyncStorage.multiRemove([HOURS_KEY, CALENDAR_KEY]).catch(() => undefined);
  }, []);
  return { read: mine !== null, hoursConfirmed: mine?.hours ?? false, calendarAnswered: mine?.calendar ?? false, rememberHours, rememberCalendar, forget };
}
