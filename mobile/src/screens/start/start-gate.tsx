// The start gate, mounted once under the app's providers beside its screens (app/_layout.tsx). It does two things,
// both by the web's own rules (start-rule.ts):
//  - A signed-in person whose first run is still ahead is sent to /welcome before anything else, and back to it from
//    anywhere until it is finished or skipped, as the web's FirstRunGate does. It waits for the settings row: on a
//    fresh install the phone's copy is empty until the first sync, and an empty copy is not a new account.
//  - A cold start lands on the view chosen in Settings › Planning "Open to" (Today, Inbox, Upcoming), as the web's
//    OpenTo does for the installed app. Once per launch, and only while the app is still on its first screen: an app
//    opened somewhere else (a link), or one the person has already moved in, is left where it is.
// While the phone's own copy is being read (a moment), paper covers the first screen, so Today is not drawn and then
// taken away. It never waits for the network: with no row on the phone the screens show, and the gate acts when the
// row arrives.
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@/data/powersync";
import { FIRST_RUN_SQL, WELCOME_PATH, type FirstRunRow } from "@/features/shell/first-run";
import { isActive } from "@/features/shell/nav";
import { OPEN_TO_SQL } from "@/features/shell/open-to-target";
import { useColours } from "~/ui/theme";
import { HOME, startRoute } from "./start-rule";

/** How long the cover may stay if the phone's copy does not answer: after that the screens show whatever happens. */
export const COVER_MS = 1500;

export function StartGate() {
  const c = useColours();
  const pathname = usePathname();
  const router = useRouter();
  const first = useQuery<FirstRunRow>(FIRST_RUN_SQL);
  const view = useQuery<{ default_view: string | null }>(OPEN_TO_SQL);
  const read = !first.isLoading && !view.isLoading;
  const firstRow = first.data?.[0];
  const viewRow = view.data?.[0];
  const target = firstRow && viewRow ? startRoute({ ...firstRow, default_view: viewRow.default_view }) : null;
  const pending = target === WELCOME_PATH;
  const away = !isActive(pathname, WELCOME_PATH);

  // The first run, from anywhere, for as long as it is ahead. (The gate is mounted beside the navigator, after it, so
  // by the time an effect here runs the screens are up and can be moved between.)
  useEffect(() => {
    if (pending && away) router.replace(WELCOME_PATH);
  }, [pending, away, router]);

  // "Open to": the one decision of a cold start. Leaving the first screen by any other way settles it too.
  const opened = useRef(false);
  /** The app has been somewhere other than its first screen since it was launched. */
  const left = useRef(false);
  useEffect(() => {
    if (pathname !== HOME) left.current = true;
    if (opened.current) return;
    if (pathname !== HOME) {
      opened.current = true;
      return;
    }
    if (target === null) return;
    opened.current = true;
    if (target !== HOME && target !== WELCOME_PATH) router.replace(target);
  }, [pathname, target, router]);

  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), COVER_MS);
    return () => clearTimeout(timer);
  }, []);

  // Covered: a cold start still on the first screen whose copy has not been read yet, or has been read and sends it
  // somewhere else. A copy with no settings row shows the screens.
  const covered = !late && pathname === HOME && !left.current && (!read || (target !== null && target !== HOME));
  return covered ? <View aria-hidden testID="start-cover" style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }]} /> : null;
}
