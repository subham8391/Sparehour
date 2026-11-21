// The morning review's host on the phone (SCREENS.md §2.3a; the web's is features/rituals/carry-review-host.tsx).
// Mounted once under the providers in the root layout, beside the screens, it watches what the web's host watches —
// the carried-over pile, the sync state, today's and yesterday's day plans — and, on the first open of a new day
// when the web's own rule says so (features/rituals/carry-review.ts: the review is on in Settings › Planning, there
// is something carried over, the first sync has settled, no ritual is open, today was neither reviewed nor planned,
// and yesterday was not closed by the shutdown), opens the review by pushing /review. Where the web keeps "this
// session already answered or dismissed today" in its own state, the phone keeps it on the device (handled-day.ts),
// so the review opens once a day at most however often the app is closed and opened. Today's "Review carried" link
// opens the same screen whenever the pile is not empty; that needs no host. It draws nothing.
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect } from "react";
import { shouldReview, steppedOffToday } from "@/features/rituals/carry-review";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useSyncState } from "../shutdown/use-sync-state";
import { handledToken, useHandledDay } from "./handled-day";
import { useCarried } from "./use-carried";

/** Where the review lives on the phone. */
export const REVIEW_ROUTE = "/review";
/** Today's address on the phone: the first tab. */
const TODAY_ROUTE = "/";

export function CarryReviewHost() {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = Boolean(useRootNavigationState()?.key);
  const params = useGlobalSearchParams<{ day?: string | string[] }>();
  const shown = Array.isArray(params.day) ? params.day[0] : params.day;
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const syncState = useSyncState();
  const todayIso = today.toString();
  const pile = useCarried(today);
  const handled = useHandledDay();

  // Never before the person's settings, the rows and the phone's own memory of the day have been read.
  const loaded = settings !== null && pile.loaded && handled.loaded;
  // Today stepped to another day keeps the review for today itself (DECISIONS.md "Today on another day").
  const offDay = steppedOffToday(pathname === TODAY_ROUTE, shown, todayIso);
  const auto =
    loaded &&
    !offDay &&
    handled.token !== handledToken(pile.user?.id, todayIso) &&
    shouldReview({ enabled: settings.carryReview, carried: pile.carried.length, syncState, pathname, today: pile.todayPlan, yesterday: pile.yesterdayPlan });
  // One review at a time: not while one is on screen, or under a screen opened over it.
  const open = auto && mounted && handled.open === 0 && pathname !== REVIEW_ROUTE;

  useEffect(() => {
    if (open) router.push(REVIEW_ROUTE);
  }, [open, router]);

  return null;
}
