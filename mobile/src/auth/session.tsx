// Who is signed in on this phone (ANDROID_APP_SPEC.md §6): the Supabase session, read once from the device and
// followed from then on. `undefined` while the device is still being read, so nothing flashes a sign-in screen at
// someone who is signed in.
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

const SessionContext = createContext<Session | null | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void supabase()
      .auth.getSession()
      .then(({ data }) => live && setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The session, null when signed out, undefined until the device has been read. */
export function useSession(): Session | null | undefined {
  return useContext(SessionContext);
}
