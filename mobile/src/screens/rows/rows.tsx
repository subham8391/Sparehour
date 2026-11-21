// A screen's task rows, wired to the phone's own database (the web's shell wires its rows the same way: the bulk
// bar, the organising island, the row menu's presets and day picker). Everything a row's ⋯, a swipe and the bulk bar
// write goes through the shared repositories, which record the undo the app's one toast offers; the presets, the
// picker's days and their readouts, the projects and the tags are read with the web's own hooks and statements. The
// drawing and what is open are rows-frame.tsx. A screen wraps its view in <Rows>; Today wraps its own in <TodayRows>,
// which also hands its sections their handlers.
import { useRouter } from "expo-router";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Clipboard from "expo-clipboard";
import { AccessibilityInfo, Platform, StyleSheet, ToastAndroid } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { localDate, type Instant } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { TAGS_SQL } from "@/data/queries/views";
import { duplicateTask } from "@/data/repositories/duplicate";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { moveWrite } from "@/features/tasks/move-options";
import { moveToDay } from "@/features/tasks/move-to-day";
import { pickerDayName, pickerDays } from "@/features/tasks/picker-days";
import { applySnooze, snoozePresets, tomorrowPreset } from "@/features/tasks/snooze";
import { taskLinkAt } from "@/features/tasks/task-link";
import { useMoveProjects } from "@/features/tasks/use-move-projects";
import { useTagRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-context";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { dayReadout, type DayReadout } from "@/features/upcoming/week";
import { config } from "~/config";
import { RowsFrame, type RowsWiring } from "./rows-frame";
import { useRows } from "./rows-context";
import { SwipeRow } from "./swipe-row";
import { TodayRowsContext, type TodayRowHandlers } from "./today-actions";

const SPACE_SQL = `select personal_space_id from users limit 1`;

/** Where a task broken down into a project opens: its page, with the add sheet up for the first step it did not have. */
export const convertedProjectHref = (projectId: string): string => `/project/${encodeURIComponent(projectId)}?add=1`;

/**
 * The picker's days and each one's readout, from the capacity engine the Week uses (the web's `usePickerDays`). Its
 * own component, mounted only while Move to… is open, so no list pays for the week's capacity; it reads the settings
 * itself and says a readout only when one changed, so the frame is not redrawn for nothing.
 */
const Readouts = memo(function Readouts({ todayIso, now, onChange }: { todayIso: string; now: Instant; onChange: (readouts: ReadonlyMap<string, DayReadout>) => void }) {
  const { settings } = useLocalDay(now);
  const days = useMemo(() => pickerDays(localDate(todayIso)), [todayIso]);
  const { byDay } = useWeekCapacity({ from: days[0], to: days[days.length - 1], today: days[0], now, settings });
  const readouts = new Map<string, DayReadout>();
  for (const [iso, c] of byDay) readouts.set(iso, dayReadout(c, iso === todayIso));
  const said = [...readouts].map(([iso, r]) => `${iso} ${r.kind} ${r.min}`).join("|");
  const latest = useRef(readouts);
  useEffect(() => {
    latest.current = readouts;
  });
  useEffect(() => onChange(latest.current), [said, onChange]);
  return null;
});

export function Rows({ tab = false, children }: { /** A tab's screen sits over the tab bar, which keeps the phone's bottom strip clear; a pushed screen keeps it clear itself. */ tab?: boolean; children: ReactNode }) {
  // One frame a screen: a screen already inside one (Today's, wrapped by its own screen) is left as it is.
  const outer = useRows();
  return outer ? <>{children}</> : <Wired tab={tab}>{children}</Wired>;
}

function Wired({ tab, children }: { tab: boolean; children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  const repo = useTaskRepo();
  const tagRepo = useTagRepo();
  const now = useNow();
  const { today, zone, ready } = useLocalDay(now);
  const choices = useMoveProjects();
  const { data: tagRows } = useQuery<{ id: string; name: string }>(TAGS_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;

  const [pickingDay, setPickingDay] = useState(false);
  const [readouts, setReadouts] = useState<ReadonlyMap<string, DayReadout>>(() => new Map());
  const todayIso = today.toString();
  // By its date: the day object is a new one each minute, the day is not.
  const days = useMemo(() => {
    const first = localDate(todayIso);
    return pickerDays(first).map((day) => {
      const name = pickerDayName(day, first);
      const date = `${weekdayName(day)} ${day.day}`;
      return { day, name, date: name === date ? undefined : date, readout: readouts.get(day.toString()) };
    });
  }, [todayIso, readouts]);
  const tags = useMemo(() => (tagRows ?? []).map((t) => ({ id: t.id, name: t.name })), [tagRows]);

  const wiring: RowsWiring = {
    today,
    // The presets are the account's day and zone: they wait for its settings row, so a quick choice never lands in UTC.
    presets: ready ? snoozePresets(now, zone, today) : [],
    days,
    choices,
    tags,
    onSnooze: (ids, preset) => void applySnooze(repo, ids, preset),
    onTomorrow: (id) => void applySnooze(repo, [id], tomorrowPreset(today)),
    onSomeday: (id) => void repo.setState(id, "someday"),
    // On to the next occurrence, no completion: the series edits load with the recurrence engine, the first time one is used.
    onSkip: (id) => void repo.series().then((s) => s.skip(id)),
    // A copy right after the task, which then opens.
    onDuplicate: (id) => void duplicateTask(db, undo ?? undefined, id).then((copy) => copy && router.push(`/task/${copy}`)),
    // The task's address on the web app, copied, with the web's quiet "Link copied" (no undo) as Android's own short note.
    onCopyLink: (id) => void copyLink(taskLinkAt(config.appUrl, id)),
    // The end of that day's list, in the same part of it: one undoable write (move-to-day.ts).
    onMoveToDay: (id, day) => void moveToDay(db, repo, id, day),
    onMove: (ids, target) => {
      const { patch, note } = moveWrite(target);
      return ids.length === 1 ? repo.update(ids[0], patch, note) : repo.updateMany(ids, patch, note);
    },
    // One write for the lot, with one undo toast that takes back only the new links.
    onTag: (ids, name) => (spaceId ? tagRepo.attachMany(ids, spaceId, name) : undefined),
    onBulk: (ids, write) => repo.updateMany(ids, write.patch, write.note),
    onBulkComplete: (ids) => repo.completeMany(ids),
    onBulkState: (ids, state) => repo.setStateMany(ids, state),
    onDayPicker: setPickingDay,
    Swipe: SwipeRow,
  };

  return (
    // The swipes need the gesture handler's own root above them; the app's root layout has none, so each frame brings one.
    <GestureHandlerRootView style={styles.fill}>
      <RowsFrame wiring={wiring} bottomInset={tab ? 0 : insets.bottom}>
        {children}
      </RowsFrame>
      {pickingDay ? <Readouts todayIso={todayIso} now={now} onChange={setReadouts} /> : null}
    </GestureHandlerRootView>
  );
}

/**
 * Today's frame: its rows' menus, swipes and ticks, and the handlers its sections read (today-actions.ts). Today's
 * own screen wraps what it draws in this and hands in the handlers it already has.
 */
export function TodayRows({ actions, children }: { actions: TodayRowHandlers; children: ReactNode }) {
  return (
    <Rows tab>
      <TodayRowsContext.Provider value={actions}>{children}</TodayRowsContext.Provider>
    </Rows>
  );
}

/** Convert task → project from a row ("Break it down", "Convert to project"): one write, then the new project opens. */
export function useBreakDown(): (id: string) => void {
  const repo = useTaskRepo();
  const router = useRouter();
  return (id) => void repo.convertToProject(id).then((out) => out && router.push(convertedProjectHref(out.projectId)));
}

async function copyLink(link: string): Promise<void> {
  try {
    await Clipboard.setStringAsync(link);
  } catch {
    return;
  }
  if (Platform.OS === "android") ToastAndroid.show("Link copied", ToastAndroid.SHORT);
  AccessibilityInfo.announceForAccessibility("Link copied");
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
