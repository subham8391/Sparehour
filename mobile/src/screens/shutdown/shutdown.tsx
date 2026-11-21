// The evening shutdown on the phone (SCREENS.md §15; the web's is app/(app)/shutdown/page.tsx), wired to the phone's
// own database. Everything it knows is the web app's own code, used as it is: what was finished on the day (from its
// rollover hour to the next), the unfinished list frozen as it opens with each row's outcome read back from its live
// row (features/rituals/shutdown-carry.ts, so the toast's Undo puts a row back to waiting), the fortnight's ratings,
// tomorrow's spare time from the capacity engine, and the day_plans row that holds the rating, the highlight and
// the moment the day was closed. The task writes go through the shared repository, which records the undo the app's
// one toast offers. The drawing is shutdown-view.tsx.
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayInstants } from "@/core/time";
import { toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { DAY_NOTES_SQL, DAY_PLAN_SQL, DONE_BETWEEN_SQL, monthsBack } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { TaskRow } from "@/data/schema.client";
import { dayPart } from "@/features/looks/look";
import { TREND_DAYS, ratingTrend } from "@/features/rituals/rating-trend";
import { useShutdownCarry } from "@/features/rituals/shutdown-carry";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { font, useColours } from "~/ui/theme";
import { ShutdownView } from "./shutdown-view";
import { syncSettled } from "./sync-state";
import { useSyncState } from "./use-sync-state";

const USER_SQL = `select id, personal_space_id from users limit 1`;

interface DayPlanRow {
  id: string;
  shutdown_at: string | null;
  highlights: string | null;
  day_rating: number | null;
}

export function Shutdown() {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const dayPlans = useMemo(() => new DayPlanRepo(db), [db]);
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const tomorrow = today.add({ days: 1 });
  const todayIso = today.toString();

  // The day as instants, for "completed today": from its rollover hour to the next, so what is ticked after midnight
  // counts for the day being shut down.
  const rolloverHour = settings?.dayRolloverHour ?? 4;
  const [dayStart, dayEnd] = useMemo(() => dayInstants(today, { timezone: zone, dayRolloverHour: rolloverHour }).map(String), [todayIso, zone, rolloverHour]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => monthsBack(today, 1), [todayIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: doneRows } = useQuery<TaskRow>(DONE_BETWEEN_SQL, [dayStart, dayEnd], { streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] });
  // Step 2's list, frozen once it is read, so "Move all to tomorrow" does not empty it and every row keeps its answer.
  const sync = useSyncState();
  const carried = useShutdownCarry({ today, dayKnown: settings !== null, settled: syncSettled(sync), tasks });
  const { data: planRows } = useQuery<DayPlanRow>(DAY_PLAN_SQL, [todayIso]);
  // The last fortnight's ratings, today's included, for step 3's line (local: day_plans sync whole).
  const { data: noteRows } = useQuery<{ date: string; day_rating: number | null }>(DAY_NOTES_SQL, [today.subtract({ days: TREND_DAYS - 1 }).toString()]);
  const trend = useMemo(() => ratingTrend(today, noteRows ?? []), [todayIso, noteRows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tomorrow's load and spare time: its work hours, meetings, blocks and what is planned on it, through the capacity engine.
  const tomorrowDraft = useTomorrowSpare(tomorrow, settings);

  const done = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const plan = planRows?.[0] ?? null;

  const user = users?.[0];
  const ctx = user?.personal_space_id ? { spaceId: user.personal_space_id, userId: user.id } : null;
  const write = (patch: Parameters<DayPlanRepo["upsert"]>[2]) => {
    if (ctx) void dayPlans.upsert(todayIso, ctx, patch);
  };
  // Back to where the shutdown was opened from: Today.
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!settings || !carried.ready) {
    return (
      <View style={[styles.waiting, { backgroundColor: c.paper, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.waitingText, { color: c.ink2 }]}>Getting your data…</Text>
      </View>
    );
  }

  return (
    <ShutdownView
      part={dayPart(now.toZonedDateTimeISO(zone).hour)}
      done={done}
      unfinished={carried.rows}
      defaultEstimateMin={settings.defaultEstimateMin}
      rating={plan?.day_rating ?? null}
      trend={trend}
      highlight={plan?.highlights ?? ""}
      tomorrow={tomorrowDraft}
      onCarry={carried.carry}
      onCarryAll={carried.carryAll}
      onRating={(r) => write({ dayRating: r })}
      onHighlight={(text) => write({ highlights: text || null })}
      // Today stepped to tomorrow, where its ribbon and timeline can be planned (DECISIONS.md "Plan tomorrow now").
      onPlanTomorrow={() => router.push(`/?day=${tomorrow.toString()}`)}
      onClose={() => {
        write({ shutdownAt: new Date().toISOString() });
        leave();
      }}
      onSkip={leave}
    />
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, paddingHorizontal: 24 },
  waitingText: { fontFamily: font.medium, fontSize: 17 },
});
