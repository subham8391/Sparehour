// The review of carried-over tasks on the phone (SCREENS.md §2.3a), at /review: the web's sheet as a screen of its
// own, opened from Today's ritual row ("Review carried") and, once at the start of a day, by the host
// (carry-review-host.tsx). Wired to the phone's own database with the web app's own code: the pile is Today's Carried
// over section, the asks are the same two a day as Today's and are recorded as they are shown
// (features/rollover/use-carry-asks.ts), and Done's writes are the web's (features/rituals/carry-review-answers.ts,
// through the shared task repository, which records one undo per answer for the app's toast). Done and Not now both
// stamp the day as reviewed (day_plans.carry_reviewed_at); so does Android's back, which is the web's Escape. A
// "Break it down" opens its new project, ready for its first step. The drawing is review-view.tsx.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { useLocalDatabase } from "@/data/powersync";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import { dayPart } from "@/features/looks/look";
import { applyReview, type SheetChoice } from "@/features/rituals/carry-review-answers";
import { useCarryAsks, useRecordAsks } from "@/features/rollover/use-carry-asks";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useColours } from "~/ui/theme";
import { handledToken, markHandled, reviewOpened } from "./handled-day";
import { ReviewView } from "./review-view";
import { useCarried } from "./use-carried";

export function Review() {
  const c = useColours();
  const router = useRouter();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const todayIso = today.toString();
  const pile = useCarried(today);
  const { carried, user } = pile;

  // The same two-a-day ask as Today (PRODUCT_SPEC.md §8.3.4), recorded once the rows are on screen.
  const { asks, fresh } = useCarryAsks(carried, { carryAskAfter: settings?.carryAskAfter ?? null, today, zone: settings?.timezone ?? "UTC", now });
  useRecordAsks(fresh, useCallback((ids: readonly string[], at: string) => repo.markAsked(ids, at), [repo]), settings !== null && pile.loaded);

  // The host opens no second review while this one is up.
  useEffect(() => reviewOpened(), []);

  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const left = useRef(false);
  const token = handledToken(user?.id, todayIso);

  /** Records that the day was reviewed, whichever way the screen is left. */
  const stamp = async () => {
    markHandled(token);
    if (!user?.personal_space_id) return;
    await new DayPlanRepo(db).upsert(todayIso, { spaceId: user.personal_space_id, userId: user.id }, { carryReviewedAt: new Date().toISOString() });
  };
  /** Leaves once: back to where the review was opened over, or on to the project a "Break it down" made. */
  const close = (project: string | null = null, answered = true) => {
    if (left.current) return;
    left.current = true;
    // Answered or dismissed, the day is not asked about again, even if its stamp could not be written.
    if (answered) markHandled(token);
    // `?add=1` opens the project with its add sheet up, as the web opens it with the cursor in its add row.
    if (project) router.replace(`/project/${encodeURIComponent(project)}?add=1`);
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const notNow = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await stamp();
    } finally {
      close();
    }
  };
  const done = async (choices: ReadonlyMap<string, SheetChoice>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    // Each "Break it down" is its own conversion and undo; the first new project opens.
    const out: { project: string | null } = { project: null };
    try {
      await applyReview(repo, carried, choices, today, out);
      await stamp();
    } finally {
      close(out.project);
    }
  };

  // Android's back is Not now, as Escape and the scrim are on the web: the day is stamped, no task is touched.
  const notNowRef = useRef(notNow);
  useEffect(() => {
    notNowRef.current = notNow;
  });
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        void notNowRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // Nothing carried over (the pile was emptied elsewhere, or the address was opened with none): there is nothing to
  // review, so the screen steps back without recording anything, as the web's sheet simply is not shown.
  const nothing = settings !== null && pile.loaded && carried.length === 0;
  useEffect(() => {
    if (nothing && !working.current) close(null, false);
  });

  // Until the settings and the pile have been read, and once the last answer has emptied it: paper, not a heading that counts nothing.
  if (!settings || !pile.loaded || carried.length === 0) return <View style={{ flex: 1, backgroundColor: c.paper }} />;

  return <ReviewView part={dayPart(now.toZonedDateTimeISO(settings.timezone).hour)} tasks={carried} today={today} defaultEstimateMin={settings.defaultEstimateMin} asks={asks} busy={busy} onDone={(choices) => void done(choices)} onNotNow={() => void notNow()} />;
}
