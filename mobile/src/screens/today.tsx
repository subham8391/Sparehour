// Today on the phone (ANDROID_APP_SPEC.md §10, step 2; the web's is app/(app)/today/page.tsx), wired to the phone's
// own database. Everything it knows comes from the web app's own code, used as it is: the data hook (useToday) for
// today or the day stepped to (`/?day=YYYY-MM-DD`), the capacity engine behind the figure and the ribbon, the hero's
// rule and words, the sort, the day's states, the carried-over asks, the suggested move of a day that is over, the
// expired digest, the calendar's reading, the placing hook behind the timeline, the repositories that write (they
// record their own undo; the toast is the app's one), and quick add behind the + button (quick-add/quick-add.tsx),
// opened on the day shown so a line with no day of its own is for that day. Plan my day is offered on the line under
// the ritual row, as on the web's phone layout: its preview docks over the Day view (plan-my-day/), the timeline
// shows what the proposal leaves free, and nothing is written until Approve. The drawing is today-view.tsx, with the
// parts in today/.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { eveningBudget } from "@/core/capacity/evening";
import { dayInstants, formatTime, instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { sortToday, type TodaySort } from "@/core/today/sort";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery, useSyncStatus } from "@/data/powersync";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, monthsBack } from "@/data/queries/shell";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import { BlockRepo } from "@/data/repositories/block-repo";
import { SettingsRepo, type SettingsPatch } from "@/data/repositories/user-settings-repo";
import type { TaskRow } from "@/data/schema.client";
import { olderThanDevice } from "@/features/finished/older-than-device";
import { dayPart } from "@/features/looks/look";
import { PLAN_LABEL, planMode } from "@/features/planning/drawing";
import { usePlanPreviewState } from "@/features/planning/use-plan-preview-state";
import { useProjectNames } from "@/features/projects/use-project-names";
import { easiestMove } from "@/features/rituals/easiest-move";
import { pullInSuggestions } from "@/features/rituals/morning-plan";
import { plannedLabel } from "@/features/rituals/planned-label";
import { closedLine } from "@/features/rituals/shutdown";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { EXPIRED_SQL, expiredLine } from "@/features/rollover/expired";
import { useAnnouncement } from "@/features/rollover/use-announcement";
import { useRecordAsks } from "@/features/rollover/use-carry-asks";
import { useNow } from "@/features/shell/use-local-day";
import { daysAway, parseDay } from "@/features/today/day-address";
import { minuteFromDay, minuteOnDay, partOfDay } from "@/features/today/day-minute";
import { dayState } from "@/features/today/day-state";
import { heroState } from "@/features/today/hero-state";
import { useToday } from "@/features/today/hooks/use-today";
import { CALENDAR_PATIENCE_MS } from "@/features/today/ribbon-words";
import { todayAsText } from "@/features/today/today-text";
import { relativeDay } from "@/ui/relative-day";
import { TodayRows } from "./rows/rows";
import { Fab } from "~/ui/fab";
import { Icon } from "~/ui/icon";
import { font, useColours } from "~/ui/theme";
import { PlanMyDay } from "./plan-my-day/plan-preview";
import { useQuickAdd } from "./quick-add/quick-add";
import { DayPane } from "./today/day-pane";
import { OlderDone } from "./today/done";
import { TodayMenuSheet, TrimSheet } from "./today/menus";
import { ribbonBreakdown, ribbonShape } from "./today/ribbon-shape";
import { DoneSection, type RowContext } from "./today/sections";
import { useCalendarLine } from "./today/use-calendar-line";
import { useDeviceValue } from "./today/use-device-value";
import { CARRIED_FOLD_AT, moveKey, todayRows } from "./today-rows";
import { todaySummary } from "./today-summary";
import { TodayView, type TodayMode } from "./today-view";

/** The web's own keys for the same choices, each remembered on the device. */
const CARRIED_OPEN_KEY = "sparehour:carried-open";
const EVENING_OPEN_KEY = "sparehour:evening-open";
const NOTHING_SQL = `select * from tasks where 0`;
/** Where the rituals and Settings live. Clear the slate and the carried-over review are sheets on the web; here they are screens of their own. */
const PLAN = "/plan";
const SHUTDOWN = "/shutdown";
const SETTINGS = "/settings";
/** Settings › Calendar: where a calendar is connected, and reconnected. */
const CALENDAR = "/settings/calendar";
const SLATE = "/slate";
const REVIEW = "/review";

/** True once `waiting` has held for `ms`; false again as soon as it stops (the ribbon's "calendar still loading"). */
function useLate(waiting: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [waiting, ms]);
  return waiting && late;
}

export function Today() {
  const c = useColours();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  // The day shown: `/?day=2026-10-08` from the header's arrows, or from another screen's link.
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const dayParam = Array.isArray(params.day) ? params.day[0] : params.day;
  const shownDay = useMemo(() => parseDay(dayParam), [dayParam]);
  const model = useToday(now, shownDay);
  const { day, onToday, past } = model;
  const status = useSyncStatus();
  const quickAdd = useQuickAdd();
  const db = useLocalDatabase();
  const projectNames = useProjectNames();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<TodayMode>("list");
  const [trimOpen, setTrimOpen] = useState(false);

  const zone = model.settings?.timezone ?? "UTC";
  const clock = now.toZonedDateTimeISO(zone);
  const eveningAt = model.settings ? model.settings.eveningStartsAt.hour * 60 + model.settings.eveningStartsAt.minute : 18 * 60;
  const defaultEstimate = model.settings?.defaultEstimateMin ?? 30;
  const tomorrow: LocalDate = model.today.add({ days: 1 });
  // How far into today now is: past midnight the day still lasts until its rollover hour, so it runs on past 1440
  // (what the placing hook reads); for everything drawn or decided here the day's own hours are then all behind.
  const nowFromDay = minuteFromDay(now, zone, model.today);
  const nowMinute = Math.min(nowFromDay, 24 * 60);

  // Today's view preferences (⋯ Sort, Show completed): one setting each on the account. The choice shows at once and
  // stays until the settings row says the same.
  const [prefs, setPrefs] = useState<SettingsPatch>({});
  if (model.settings && Object.keys(prefs).length > 0 && (prefs.todaySort ?? model.settings.todaySort) === model.settings.todaySort && (prefs.showCompleted ?? model.settings.showCompleted) === model.settings.showCompleted) setPrefs({});
  const sort: TodaySort = prefs.todaySort ?? model.settings?.todaySort ?? "manual";
  const showCompleted = prefs.showCompleted ?? model.settings?.showCompleted ?? false;
  const savePref = (patch: SettingsPatch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    if (model.settingsId) void new SettingsRepo(db).update(model.settingsId, patch);
  };
  // Sort is a view over the two lists: a sorted copy, never a rewritten day_sort_key.
  const todayList = sortToday(model.todayTasks, sort, defaultEstimate);
  const eveningList = sortToday(model.eveningTasks, sort, defaultEstimate);
  const manual = sort === "manual";

  // Another day: only the address changes, so the day is kept when the screen is come back to.
  const openDay = (next: LocalDate) => router.setParams({ day: next.equals(model.today) ? undefined : next.toString() });
  const stepBy = (days: number) => openDay(day.add({ days }));

  // ---- time blocks: the selected block and the task waiting for a tap, held here as the web's page holds them; the
  // placing itself runs in the day pane (today/day-pane.tsx).
  const windows = model.capacity?.windows ?? [];
  const dayStart = windows[0]?.start ?? 9 * 60;
  const dayEnd = windows[windows.length - 1]?.end ?? 17 * 60;
  const dayTasks = [...model.carried, ...model.todayTasks, ...model.eveningTasks];
  const findTask = (id: string): Task | undefined => dayTasks.find((t) => t.id === id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const placingTask = placingId ? findTask(placingId) : undefined;
  // Plan my day (SCREENS.md §2.1, §2.6a): the preview shows the Day view with the proposal's free time on it, nothing
  // written until Approve. It plans today, so asked for on another day it comes home first.
  const planning = usePlanPreviewState(() => {
    if (!onToday) openDay(model.today);
    setMode("day");
    setSelectedBlockId(null);
    setPlacingId(null);
  });
  // A meeting picked on the ribbon (SCREENS.md §2.2): the Day view, the hours turned to it, outlined for a moment.
  const [shownMeeting, setShownMeeting] = useState<number | null>(null);
  useEffect(() => {
    if (shownMeeting === null) return;
    const t = setTimeout(() => setShownMeeting(null), 2400);
    return () => clearTimeout(t);
  }, [shownMeeting]);
  /** How tall the docked preview is, so the day can be scrolled clear of it. */
  const [dockHeight, setDockHeight] = useState(0);
  // What belongs to one day lets go when the day changes: the selected block, a task waiting for a time, and a plan
  // preview when the day stepped away from today.
  const dayIso = day.toString();
  const [daySeen, setDaySeen] = useState(dayIso);
  if (dayIso !== daySeen) {
    setDaySeen(dayIso);
    setSelectedBlockId(null);
    setPlacingId(null);
    setTrimOpen(false);
    if (!onToday && planning.mode) planning.close();
  }

  // The day's ritual state: once shut down, the ribbon gives way to the day's summary.
  const { data: planRows } = useQuery<{ shutdown_at: string | null; planned_at: string | null; highlights: string | null; day_rating: number | null }>(DAY_PLAN_SQL, [dayIso]);
  const plan = planRows?.[0] ?? null;
  const localTimeOf = (iso: string) => formatTime(instant(normaliseTimestamp(iso)).toZonedDateTimeISO(zone).toPlainTime());
  const closedAt = plan?.shutdown_at ? localTimeOf(plan.shutdown_at) : null;
  const plannedAt = plan?.planned_at ? localTimeOf(plan.planned_at) : null;
  // The day from its rollover hour to the next: a task ticked at 01:00 is done on the day that is ending.
  const rolloverHour = model.settings?.dayRolloverHour ?? 4;
  const dayBounds = useMemo(() => dayInstants(day, { timezone: zone, dayRolloverHour: rolloverHour }).map(String) as [string, string], [day, zone, rolloverHour]);
  const months = useMemo(() => monthsBack(day, 1), [day]);
  const { data: doneRows } = useQuery<TaskRow>(DONE_BETWEEN_SQL, dayBounds, { streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] });
  const doneToday = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  // A day that has passed always lists what was finished on it.
  const showDone = showCompleted || past;
  const bodyState = dayState({ closed: Boolean(closedAt), carried: model.carried.length, today: model.todayTasks.length, evening: model.eveningTasks.length, done: doneToday.length });
  // Both are today's: another day with nothing on it just says so, with no pull-in or plan to offer.
  const allDone = model.ready && onToday && bodyState === "all-done";
  const emptyDay = model.ready && onToday && bodyState === "empty";
  const { data: openRows } = useQuery<TaskRow>(allDone || emptyDay ? OPEN_TASKS_SQL : NOTHING_SQL);
  const todayKey = model.today.toString();
  const pullIn = useMemo(() => (allDone || emptyDay ? pullInSuggestions((openRows ?? []).map(toTask), model.today).map((s) => ({ task: s.task, source: s.source === "deadline" ? null : s.source })) : []), [allDone, emptyDay, openRows, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Over (PRODUCT_SPEC.md §9.4): the ribbon names one move, the largest task with no deadline that fits tomorrow. Trim
  // and its suggestion are today's; a later day over its time says how much, and its rows move as rows do.
  const hero = model.capacity && model.capacity.state !== "no_work_day" ? heroState(model.capacity) : null;
  const overMin = hero?.over && onToday ? hero.min : 0;
  const { spareMin: tomorrowSpare } = useTomorrowSpare(tomorrow, model.settings, overMin > 0);
  const overMove = overMin > 0 ? (easiestMove(model.todayTasks, overMin, tomorrowSpare, defaultEstimate)?.task.title ?? null) : null;
  const hasDay = Boolean(model.capacity && model.capacity.state !== "no_work_day");
  // Plan my day's preview, which plans today and takes the lists' place: the Day view, whatever was shown before.
  const previewing = planning.mode !== null && onToday && !closedAt && hasDay;
  const shown: TodayMode = hasDay && (mode === "day" || previewing) ? "day" : "list";
  const shutdownReady = !model.capacity || model.capacity.state === "no_work_day" || nowMinute >= model.capacity.windows[model.capacity.windows.length - 1].end - 120;
  const finish = model.capacity?.projectedFinish ?? null;
  // The ritual row turns to the shutdown once the plan is projected to be done, or the day is two hours from its end.
  const shutdownTime = shutdownReady || (finish !== null && nowMinute >= finish.hour * 60 + finish.minute);
  // Past the working day: the ritual row says so even when there is no projected finish left to name.
  const dayOver = hasDay && nowMinute >= dayEnd;
  const calendarLate = useLate(model.calendarLoading && model.calendarConnected, CALENDAR_PATIENCE_MS);

  // Above eight rows Carried over starts folded; unfolding it holds for the rest of the day on this phone.
  const [carriedOpenOn, setCarriedOpenOn] = useDeviceValue(CARRIED_OPEN_KEY);
  const carriedFolded = model.carried.length > CARRIED_FOLD_AT && carriedOpenOn !== todayKey;
  // This evening starts folded on a phone; opening or closing it is remembered.
  const [eveningSaved, setEveningSaved] = useDeviceValue(EVENING_OPEN_KEY);
  const eveningMin = model.eveningTasks.reduce((sum, t) => sum + (t.estimateMin ?? defaultEstimate), 0);
  const eveningFull = Boolean(model.settings) && model.eveningTasks.length > 0 && eveningBudget({ windows, eveningStartsAt: model.settings!.eveningStartsAt, eveningEndsAt: model.settings!.eveningEndsAt, plannedMin: eveningMin }).full;
  // An ask is recorded once it is on screen: a folded pile shows none, and neither does the Day view.
  useRecordAsks(model.freshAsks, model.markAsked, model.ready && !carriedFolded && shown === "list");

  // The once-only expired digest, and what the calendar needs saying: both are today's, bar a calendar issue that
  // pauses blocking, which a later day says too.
  const { data: expiredRows } = useQuery<{ expired_at: string | null }>(EXPIRED_SQL);
  const expiredStamps = useMemo(() => (expiredRows ?? []).map((r) => r.expired_at), [expiredRows]);
  const expired = useAnnouncement("expired", expiredStamps);
  const calendar = useCalendarLine({ shown: !closedAt && !past && Boolean(model.capacity) && model.calendarConnected, onToday, onReconnect: () => router.push(CALENDAR) });

  // "Block removed in Google Calendar" under a row, once: dismissed by its ×, or when Today is left.
  const removedShown = useRef<string[]>([]);
  useEffect(() => {
    removedShown.current = [...model.removedBlocks].filter(([taskId]) => !model.blocksByTask.has(taskId)).flatMap(([, ids]) => ids);
  });
  useEffect(
    () => () => {
      if (removedShown.current.length > 0) void new BlockRepo(db).dismissNotices(removedShown.current).catch(() => undefined);
    },
    [db],
  );

  // The repositories record the undo; the toast with Undo is the app's one (ui/undo-provider.tsx).
  const complete = (task: Task) => void model.repo.complete(task.id);
  const open = (task: Task) => router.push(`/task/${task.id}`);
  const toTomorrow = (task: Task) => void model.repo.reschedule(task.id, tomorrow);
  const toSomeday = (task: Task) => void model.repo.setState(task.id, "someday");
  const drop = (task: Task) => void model.repo.setState(task.id, "dropped");
  // The task becomes a project and is gone as a task: its project opens.
  const convert = (task: Task) => void model.repo.convertToProject(task.id).then((out) => out && router.push(`/project/${out.projectId}`));
  const move = (task: Task, dir: -1 | 1) => {
    const key = moveKey(model.todayTasks, task.id, dir);
    if (key) void model.repo.setDayOrder(task.id, key);
  };
  // Tap-to-schedule needs the timeline: the Day view.
  const startPlacing = (task: Task) => {
    setPlacingId(task.id);
    setMode("day");
  };
  const carriedIds = model.carried.map((t) => t.id);

  if (!model.ready) {
    return (
      <View style={[styles.waiting, { backgroundColor: c.paper, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.waitingText, { color: c.ink2 }]}>{status.connected ? "Getting your data…" : "Connecting…"}</Text>
      </View>
    );
  }

  const { minute: dayMinute, onDay: nowOnDay } = minuteOnDay(now, zone, day);
  // A day that began before the week the phone holds: its two instants, for the list that asks the server.
  const older = past && olderThanDevice(dayBounds, now) ? dayBounds : null;
  const rowContext: RowContext = { today: model.today, defaultEstimateMin: defaultEstimate, projectNames, onComplete: complete, onOpen: open };
  const doneLabel = onToday ? "Done today" : `Done on ${formatDay(day, { today: model.today })}`;
  // "Your day": the timeline in the lists' place, with the placing hook behind every tap (today/day-pane.tsx).
  const cap = model.capacity;
  // Once the day has started and the plan has put blocks on it, the line offers to re-plan what is left.
  const nextPlan = planMode(nowMinute, dayStart, model.blocks.some((b) => b.source === "plan"));
  // While previewing, the gaps are what the proposal leaves and the plan's own earlier blocks it replaces are hidden;
  // the "done by" marker belongs to the day as it is, so it steps aside.
  const drawing = previewing ? planning.drawing : null;
  const replacedIds = new Set(drawing?.replacedIds ?? []);
  const dayPane =
    cap && hasDay
      ? (above: ReactNode) => (
          <DayPane
            above={above}
            c={drawing ? { ...cap, free: [...drawing.free], projectedFinish: null } : cap}
            nowMin={dayMinute}
            nowShown={nowOnDay}
            blocks={drawing ? model.blocks.filter((b) => !replacedIds.has(b.id)) : model.blocks}
            proposed={drawing?.ghosts}
            shownMeeting={shownMeeting}
            meetings={model.meetings}
            dayStart={dayStart}
            dayEnd={dayEnd}
            bufferPct={model.settings?.bufferPct}
            hint={model.blocks.length === 0 && !placingTask && !previewing && !past}
            // Room to scroll the whole day above the docked preview.
            bottomRoom={previewing ? dockHeight : undefined}
            // A day that has passed is drawn, not edited.
            readOnly={past}
            placing={{
              day,
              zone,
              blocks: model.blocks,
              free: cap.free,
              dayStart,
              dayEnd,
              nowMinute: onToday ? nowFromDay : null,
              defaultEstimateMin: defaultEstimate,
              findTask,
              tasks: dayTasks,
              onPlaced: () => setMode("day"),
              state: { selectedBlockId, setSelectedBlockId, placing: placingId, setPlacing: setPlacingId },
            }}
            onOpenTask={(id) => router.push(`/task/${id}`)}
          />
        )
      : undefined;
  return (
    // Today's rows are the shared row (screens/rows): its ⋯, swipes and long-press ticks, with Today's own actions.
    <TodayRows
      actions={{
        onToday: (task) => void model.repo.reschedule(task.id, model.today),
        onTomorrow: day.equals(tomorrow) ? undefined : toTomorrow,
        onSomeday: toSomeday,
        onDrop: drop,
        onConvert: convert,
        onMoveUp: manual ? (task) => move(task, -1) : undefined,
        onMoveDown: manual ? (task) => move(task, 1) : undefined,
        onBlock: hasDay ? startPlacing : undefined,
      }}
    >
      <View style={styles.fill}>
        <TodayView
          part={dayPart(clock.hour)}
          today={model.today}
          // Off today the eyebrow names how far the day is, with the way back under the date.
          eyebrow={onToday ? `Today · ${partOfDay(nowMinute, eveningAt)}` : daysAway(day, model.today)}
          title={formatDay(day, { weekday: "long", month: "long", today: model.today })}
          onBackToToday={onToday ? undefined : () => openDay(model.today)}
          onPrevDay={() => stepBy(-1)}
          onNextDay={() => stepBy(1)}
          allDay={model.allDay}
          past={past}
          summary={todaySummary(model.capacity, {
            connected: model.calendarConnected,
            plannedCount: model.todayTasks.length + model.eveningTasks.length,
            finished: doneToday.length > 0,
            otherDay: !onToday,
            calendarLate,
            trim: onToday,
            suggestion: overMove,
          })}
          // No now mark and no elapsed part on another day.
          ribbon={model.capacity ? ribbonShape(model.capacity, onToday ? nowMinute : undefined) : null}
          // A tap on the ribbon: the breakdown behind the figure, the web's own equation and segment names.
          breakdown={cap ? ribbonBreakdown(cap, { bufferPct: model.settings?.bufferPct ?? 15, connected: model.calendarConnected, meetings: model.meetings, blocks: model.blocks }) : null}
          // Free time: "Add something" for the day shown, the box empty and the day carried beside it.
          onAddSomething={() => quickAdd.open({ day: model.day })}
          // A meeting: the Day view, where it is drawn by name.
          onShowMeeting={(meeting) => {
            setMode("day");
            setShownMeeting(meeting.start);
          }}
          onTrim={onToday ? () => setTrimOpen(true) : undefined}
          onPlanDay={() => router.push(PLAN)}
          onConnectCalendar={() => router.push(CALENDAR)}
          closed={closedAt ? { line: closedLine(older ? null : doneToday, defaultEstimate, closedAt, plan?.day_rating ?? null), highlights: plan?.highlights ?? null } : null}
          expired={
            onToday && expired.count > 0
              ? {
                  line: expiredLine(expired.count),
                  onReview: () => {
                    expired.dismiss();
                    router.push("/logbook?show=expired");
                  },
                  onDismiss: expired.dismiss,
                }
              : null
          }
          calendar={calendar}
          // The rituals are today's, and a day that was shut down has none left to offer.
          ritual={
            onToday && !closedAt
              ? {
                  shutdown: shutdownTime,
                  shutdownNote: finish ? `done by ${formatTime(finish)}` : dayOver ? "Day’s over" : null,
                  plannedLabel: plannedAt ? plannedLabel(plannedAt) : null,
                  onPlan: () => router.push(PLAN),
                  onShutdown: () => router.push(SHUTDOWN),
                  plan: hasDay ? { label: PLAN_LABEL[nextPlan], open: planning.mode !== null, onOpen: () => planning.open(nextPlan) } : null,
                  onReview: model.carried.length > 0 ? () => router.push(REVIEW) : undefined,
                }
              : null
          }
          mode={shown}
          // List, asked for while a plan is previewed, puts the preview away: nothing was written.
          onMode={(next) => {
            if (next === "list" && planning.mode) planning.close();
            setMode(next);
          }}
          dayPane={dayPane}
          previewing={previewing}
          rows={todayRows(model.carried, todayList, eveningList, onToday ? "Today" : relativeDay(day, model.today))}
          dayLabel={onToday ? "Today" : relativeDay(day, model.today)}
          dayState={allDone ? "all-done" : emptyDay ? "empty" : "planned"}
          spareMin={model.capacity && model.capacity.state !== "no_work_day" ? model.capacity.spareMin : 0}
          pullIn={pullIn}
          carriedFolded={carriedFolded}
          onExpandCarried={() => setCarriedOpenOn(todayKey)}
          onClearSlate={() => router.push(SLATE)}
          // The whole pile at once, each one statement and one undo.
          onAllTomorrow={() => void model.repo.updateMany(carriedIds, { doDate: tomorrow }, "Moved {title} to tomorrow")}
          onAllSomeday={() => void model.repo.setStateMany(carriedIds, "someday")}
          eveningOpen={eveningSaved === "1"}
          onEveningToggle={(next) => setEveningSaved(next ? "1" : "0")}
          eveningFull={eveningFull}
          done={
            !showDone ? null : older ? (
              // A day older than the phone's week: the server is asked for the rest of what was finished on it.
              <OlderDone key={older[0]} label={doneLabel} from={older[0]} to={older[1]} zone={zone} today={model.today} have={doneToday} ctx={rowContext} />
            ) : (
              <DoneSection label={doneLabel} tasks={doneToday} older={null} onReopen={past ? null : (task) => void model.repo.reopen(task.id)} ctx={rowContext} />
            )
          }
          defaultEstimateMin={defaultEstimate}
          blocksByTask={model.blocksByTask}
          projectNames={projectNames}
          removed={new Set(model.removedBlocks.keys())}
          onDismissRemoved={(task) => void new BlockRepo(db).dismissNotices(model.removedBlocks.get(task.id) ?? [])}
          onComplete={complete}
          onOpen={open}
          onToday={(task) => void model.repo.reschedule(task.id, model.today)}
          // Not on tomorrow itself.
          onTomorrow={day.equals(tomorrow) ? undefined : toTomorrow}
          onSomeday={toSomeday}
          onDrop={drop}
          onConvert={convert}
          // A sorted list is a view, not the hand order: reordering waits for Manual.
          onMoveUp={manual ? (task) => move(task, -1) : undefined}
          onMoveDown={manual ? (task) => move(task, 1) : undefined}
          // Still there once blocked: a task may take a second block (PRODUCT_SPEC.md §10.2).
          onBlock={hasDay ? startPlacing : undefined}
          onMenu={() => setMenu(true)}
          bottomRoom={88}
        />
        {/* The Day view is a timeline, not a task list: its free gaps are what a tap schedules into, so the + steps aside. */}
        {shown === "list" && (
          <Fab label="Add a task" onPress={() => quickAdd.open({ day: model.day })} />
        )}
        {previewing && planning.mode ? (
          // A sheet docked over the Day view: the bottom of the screen, the day in sight above it.
          <PlanMyDay mode={planning.mode} model={model} now={now} layout="dock" onDrawing={planning.setDrawing} onClose={planning.close} onHeight={setDockHeight} />
        ) : null}
        <TodayMenuSheet
          open={menu}
          onClose={() => setMenu(false)}
          // A day that has passed has nothing to sort or clear; a later one keeps Sort and Show completed.
          sort={past ? undefined : { value: sort, onChange: (value) => savePref({ todaySort: value }) }}
          showCompleted={past ? undefined : { value: showCompleted, onChange: (value) => savePref({ showCompleted: value }) }}
          onClearSlate={onToday ? () => router.push(SLATE) : undefined}
          onTrim={onToday ? () => setTrimOpen(true) : undefined}
          onShareText={
            onToday
              ? () =>
                  void Share.share({ message: todayAsText({ day, carried: model.carried, today: todayList, evening: eveningList, blockStart: (id) => model.blocksByTask.get(id)?.[0]?.start ?? null, defaultEstimateMin: defaultEstimate }) }).catch(() => undefined)
              : undefined
          }
          // Sign out is Settings' own (its Account section).
          onSettings={() => router.push(SETTINGS)}
        />
        <TrimSheet open={trimOpen && onToday} tasks={model.todayTasks} overMin={overMin} defaultEstimateMin={defaultEstimate} onTomorrow={toTomorrow} onSomeday={toSomeday} onDrop={drop} onClose={() => setTrimOpen(false)} />
      </View>
    </TodayRows>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  waiting: { flex: 1, paddingHorizontal: 24 },
  waitingText: { fontFamily: font.medium, fontSize: 17 },
});
