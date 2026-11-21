// The Week tab as the phone draws it (the web's Upcoming at phone width, SCREENS.md §3 and §6): the range and the
// week's spare total, a 7-day strip of mini capacity bars pinned over the agenda (a tap jumps to the day), then the
// days stacked, each with its readout, its bar and its tasks, a run of free days folded into one line of day cells;
// past the week the agenda keeps going by month, with "Due" and "Starting later" on their days; and "Not yet
// planned" as a strip over the tab bar that opens a sheet with a day to tap per task. Presentational: it is handed
// everything it shows, so it is drawn with fixtures in the browser preview and in tests, and with the real week by
// week.tsx.
import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { foldFreeDays } from "@/features/tasks/free-days";
import { agendaDays, dayLabel, isFreeDay, plannedMinutes, type ColumnDay, type StripDay } from "@/features/upcoming/agenda";
import type { AgendaDay, LaterGroup } from "@/features/upcoming/later";
import type { DayReadout, WeekMode } from "@/features/upcoming/week";
import { Button } from "~/ui/button";
import { useReduceMotion } from "~/ui/motion";
import { Card, CardRow } from "~/ui/card";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { Icon, type IconName } from "~/ui/icon";
import { Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { Segmented } from "~/ui/segmented";
import { moveActions } from "~/screens/rows/row-menu";
import { TaskRow } from "~/screens/rows/task-row";
import { TARGET, font, useColours, type Colours } from "~/ui/theme";
import { DayBar, ReadoutText } from "./day-bar";
import { DayStrip } from "./day-strip";
import { UnplannedSheet, UnplannedStrip } from "./unplanned-sheet";

export interface WeekViewProps {
  part: DayPart;
  /** "Upcoming · rolling 7 days" */
  eyebrow: string;
  /** "Sat 21 – Fri 27 November" */
  title: string;
  /** "11h 15m spare this week"; null until capacity is worked out. */
  totalLine: string | null;
  mode: WeekMode;
  /** Weeks on from this one; 0 is the week that holds today. */
  offset: number;
  today: LocalDate;
  /** The seven days on screen, as the shared agenda built them. */
  days: readonly ColumnDay[];
  /** Past the week: by month group, then by day. */
  later: readonly LaterGroup[];
  /** The compact readout of each later day still within the next two weeks, by ISO day. */
  laterReadouts: ReadonlyMap<string, DayReadout>;
  /** Active tasks with no day yet. */
  unplanned: readonly Task[];
  /** The next seven days from today, for the "Not yet planned" sheet. */
  nextDays: readonly StripDay[];
  projectNames: ReadonlyMap<string, string>;
  defaultEstimateMin: number;
  /** A new phone whose first sync has not landed: an empty week is not a fact yet. */
  waiting: boolean;
  /** "Nothing scheduled beyond today." */
  noneAhead: boolean;
  onMode: (mode: WeekMode) => void;
  onStep: (delta: 1 | -1) => void;
  onThisWeek: () => void;
  onComplete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  /** A planned row's own moves (the web's Upcoming rows): Today, Tomorrow or Someday. Left out, the rows have no ⋯. */
  onMove?: (task: Task, to: "today" | "tomorrow" | "someday") => void;
  /** Converts the task to a project: the long-estimate hint's "Break it down". */
  onBreakDown?: (task: Task) => void;
  /** A day's header opens that day. */
  onOpenDay: (day: LocalDate) => void;
  /** Add a task on a day; null from the empty week's "Add a task", which names no day. */
  onAdd: (day: LocalDate | null) => void;
  /** A tap on a day under a task in "Not yet planned". */
  onPlace: (task: Task, day: LocalDate) => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

export function WeekView(p: WeekViewProps) {
  const c = useColours();
  const [sheet, setSheet] = useState(false);
  // A day the strip jumped to is unfolded out of its run of free days, so it has a header to land on.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const tops = useRef(new Map<string, number>());
  const wanted = useRef<string | null>(null);
  // Settings › Appearance › Motion, or the phone's own setting while that is System (ui/motion.ts).
  const calm = useReduceMotion();

  const [first, ...rest] = agendaDays(p.days);
  const segments = foldFreeDays(rest, (d) => isFreeDay(d) && !unfolded.has(d.day.toString()));
  const stacked = new Set([...(first ? [first] : []), ...segments.flatMap((s) => (s.kind === "day" ? [s.day] : []))].map((d) => d.day.toString()));
  const shown = new Set([...(first ? [first] : []), ...rest].map((d) => d.day.toString()));

  const land = (iso: string) => {
    const top = tops.current.get(iso);
    if (top === undefined) return;
    wanted.current = null;
    scroll.current?.scrollTo({ y: Math.max(0, top - 4), animated: !calm });
  };
  const jumpTo = (d: StripDay) => {
    const iso = d.day.toString();
    wanted.current = iso;
    // A stacked day is there to land on; a folded one lands once it has been laid out with a header of its own.
    if (stacked.has(iso)) land(iso);
    else setUnfolded((s) => new Set(s).add(iso));
  };
  const placed = (iso: string, top: number) => {
    tops.current.set(iso, top);
    if (wanted.current === iso) land(iso);
  };

  const detail = (t: Task) => [t.projectId ? p.projectNames.get(t.projectId) : undefined, ...(t.tags ?? []).map((tag) => `@${tag}`)].filter(Boolean).join(" · ") || undefined;
  const tomorrow = p.today.add({ days: 1 });
  const { onMove } = p;
  /** Today and Tomorrow where the task is not there already, then Someday, as the web's Upcoming rows offer them. */
  const actionsFor = (t: Task) =>
    onMove
      ? moveActions({ onToday: t.doDate?.equals(p.today) ? undefined : () => onMove(t, "today"), onTomorrow: t.doDate?.equals(tomorrow) ? undefined : () => onMove(t, "tomorrow"), onSomeday: () => onMove(t, "someday") })
      : undefined;
  const minutes = (tasks: readonly Task[]) => formatMinutes(plannedMinutes(tasks, p.defaultEstimateMin));
  /** `plain`: listed for its deadline or the day it starts, not planned there: the row opens and completes, no more. */
  const rows = (tasks: readonly Task[], plain = false) => (
    <Card>
      {tasks.map((task, i) => (
        <CardRow key={task.id} first={i === 0}>
          <TaskRow task={task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} detail={detail(task)} onComplete={p.onComplete} onOpen={p.onOpen} actions={plain ? undefined : actionsFor(task)} onBreakDown={plain ? undefined : p.onBreakDown} />
        </CardRow>
      ))}
    </Card>
  );
  /** The thin "Due" group: listed for the deadline, planned on another day or on none. */
  const dueGroup = (d: AgendaDay) =>
    d.due.length > 0 && (
      <View>
        <View style={styles.due}>
          <Icon name="flag" size={12} color={c.ink3} />
          <Text accessibilityRole="header" style={[styles.eyebrow, { color: c.ink3 }]}>
            DUE
          </Text>
        </View>
        {rows(d.due, true)}
      </View>
    );
  // Hidden by a start date: listed on the day it starts, folded.
  const startingGroup = (d: AgendaDay) =>
    d.startingLater.length > 0 && (
      <CollapsedGroup label="Starting later" count={d.startingLater.length}>
        {rows(d.startingLater, true)}
      </CollapsedGroup>
    );

  const stackedDay = (d: ColumnDay) => {
    const iso = d.day.toString();
    const label = dayLabel(d);
    return (
      <View key={iso} testID={`day-${iso}`} onLayout={(e) => placed(iso, e.nativeEvent.layout.y)}>
        <SectionLabel
          label={label}
          count={d.tasks.length > 0 ? d.tasks.length : undefined}
          detail={[d.isToday ? "today" : null, d.tasks.length > 0 ? minutes(d.tasks) : null].filter(Boolean).join(" · ") || undefined}
          action={
            <View style={styles.headActions}>
              {/* A day already gone takes nothing new: a task put there would only be carried over. */}
              {!d.past && <HeadButton icon="plus" label={`Add a task on ${label}`} onPress={() => p.onAdd(d.day)} c={c} />}
              <HeadButton icon="chevron-right" label={`Open ${label}`} onPress={() => p.onOpenDay(d.day)} c={c} />
            </View>
          }
        />
        {d.readout && d.capacity ? (
          <View style={styles.capacity}>
            <ReadoutText readout={d.readout} />
            <DayBar c={d.capacity} readout={d.readout} />
          </View>
        ) : null}
        {/* The evening's tasks come after the day's, as on the web's stacked days. */}
        {d.tasks.length === 0 ? <Text style={[styles.free, { color: c.ink3 }]}>Free.</Text> : rows([...d.tasks.filter((t) => !t.evening), ...d.tasks.filter((t) => t.evening)])}
        {dueGroup(d)}
        {startingGroup(d)}
      </View>
    );
  };

  const freeRun = (days: readonly ColumnDay[]) => (
    <View key={`free-${days[0].day.toString()}`}>
      <SectionLabel label={`${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`} detail="free" />
      {/* Each free day keeps its readout and bar; a tap adds a task on it. */}
      <View style={styles.cells}>
        {days.map((d) => (
          <Pressable key={d.day.toString()} accessibilityRole="button" accessibilityLabel={`Add a task on ${dayLabel(d)}`} onPress={() => p.onAdd(d.day)} style={({ pressed }) => [styles.cell, { backgroundColor: pressed ? c.surface2 : c.surface, borderColor: c.line }]}>
            <View style={styles.cellHead}>
              <Text style={[styles.cellDay, { color: c.ink2 }]}>{dayLabel(d)}</Text>
              <Icon name="plus" size={16} color={c.ink3} />
            </View>
            {d.readout && d.capacity ? (
              <>
                <ReadoutText readout={d.readout} />
                <DayBar c={d.capacity} readout={d.readout} />
              </>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Screen
      title={p.title}
      eyebrow={p.eyebrow}
      part={p.part}
      scroll={false}
      actions={
        <>
          <HeadButton icon="arrow-left" label="Previous week" disabled={p.offset === 0} onPress={() => p.onStep(-1)} c={c} large />
          <HeadButton icon="arrow-right" label="Next week" onPress={() => p.onStep(1)} c={c} large />
        </>
      }
    >
      {p.totalLine ? <Text style={[styles.total, { color: c.ink2 }]}>{p.totalLine}</Text> : null}
      {/* Pinned while the agenda scrolls under it. */}
      {!p.waiting && (
        <View style={[styles.strip, { borderBottomColor: c.line }]}>
          <DayStrip days={p.days} label="Jump to a day" onPick={jumpTo} isDisabled={(d) => !shown.has(d.day.toString())} />
        </View>
      )}
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: (p.bottomRoom ?? 0) + 24 }}>
        <View style={styles.controls}>
          <View style={styles.modes}>
            <Segmented
              label="Days shown"
              value={p.mode}
              onChange={p.onMode}
              options={[
                { value: "rolling", label: "Next 7 days" },
                { value: "calendar", label: "Calendar week" },
              ]}
            />
          </View>
          {p.offset > 0 && <Button variant="quiet" label="this week" accessibilityLabel="Back to this week" icon={<Icon name="arrow-left" size={16} color={c.ink2} />} onPress={p.onThisWeek} />}
        </View>
        {p.waiting ? <Text style={[styles.waiting, { color: c.ink2 }]}>Getting your tasks…</Text> : null}
        {!p.waiting && p.noneAhead ? (
          <View style={styles.empty}>
            <Empty title="Nothing scheduled beyond today.">
              {p.unplanned.length > 0 ? <Button variant="quiet" label="Plan your week" onPress={() => setSheet(true)} style={styles.emptyAction} /> : <Button variant="quiet" label="Add a task" onPress={() => p.onAdd(null)} style={styles.emptyAction} />}
            </Empty>
          </View>
        ) : null}
        {/* Each stacked day is the scroll's own child, so where it is laid out is where the strip's jump lands. */}
        {!p.waiting && first ? stackedDay(first) : null}
        {!p.waiting ? segments.map((seg) => (seg.kind === "day" ? stackedDay(seg.day) : freeRun(seg.days))) : null}
        {/* Past the week the agenda keeps going (SCREENS.md §6), by month group, then by day. */}
        {!p.waiting
          ? p.later.map((g) => (
              <View key={g.key}>
                <SectionLabel label={g.label} count={g.days.reduce((n, d) => n + d.tasks.length, 0) || undefined} />
                {g.days.map((d) => {
                  const readout = p.laterReadouts.get(d.day.toString());
                  return (
                    <View key={d.day.toString()} style={styles.laterDay}>
                      <View style={styles.laterHead}>
                        <Text accessibilityRole="header" style={[styles.laterName, { color: c.ink2 }]}>
                          {formatDay(d.day, { today: p.today })}
                          {d.tasks.length > 0 && <Text style={[styles.laterSum, { color: c.ink3 }]}> · {minutes(d.tasks)}</Text>}
                        </Text>
                        {readout ? <ReadoutText readout={readout} /> : null}
                      </View>
                      {d.tasks.length > 0 && rows([...d.tasks.filter((t) => !t.evening), ...d.tasks.filter((t) => t.evening)])}
                      {dueGroup(d)}
                      {startingGroup(d)}
                    </View>
                  );
                })}
              </View>
            ))
          : null}
      </ScrollView>
      {/* "Not yet planned" is the strip over the tab bar, clear of the add button (SCREENS.md §3). */}
      {!p.waiting && p.unplanned.length > 0 && <UnplannedStrip count={p.unplanned.length} onOpen={() => setSheet(true)} bottom={25} />}
      <UnplannedSheet open={sheet} tasks={p.unplanned} days={p.nextDays} today={p.today} defaultEstimateMin={p.defaultEstimateMin} detail={detail} onPlace={p.onPlace} onComplete={p.onComplete} onOpen={p.onOpen} onClose={() => setSheet(false)} />
    </Screen>
  );
}

/** A small icon button: beside a day's label (36 points drawn, 44 to the touch), or in the header (44 points). */
function HeadButton({ icon, label, onPress, c, disabled = false, large = false }: { icon: IconName; label: string; onPress: () => void; c: Colours; disabled?: boolean; large?: boolean }): ReactNode {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={large ? 0 : 4} style={[large ? styles.headButtonLarge : styles.headButton, { opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} size={large ? 22 : 18} color={c.ink2} strokeWidth={1.7} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  total: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, marginTop: -10, marginBottom: 8, paddingHorizontal: 20, fontVariant: ["tabular-nums"] },
  strip: { paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  controls: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingTop: 12 },
  modes: { flex: 1 },
  waiting: { fontFamily: font.medium, fontSize: 17, paddingHorizontal: 22, paddingTop: 20 },
  empty: { marginTop: 16 },
  emptyAction: { alignSelf: "flex-start", marginLeft: -12 },
  headActions: { flexDirection: "row", alignItems: "center", marginRight: -8, gap: 4 },
  headButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headButtonLarge: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  capacity: { marginHorizontal: 22, marginBottom: 10, gap: 6 },
  free: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, marginHorizontal: 22 },
  due: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 22, marginTop: 14, marginBottom: 8 },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  cells: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, marginHorizontal: 16 },
  cell: { width: "48.5%", minHeight: TARGET, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 6, justifyContent: "center" },
  cellHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cellDay: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  laterDay: { marginBottom: 14 },
  laterHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginHorizontal: 22, marginBottom: 8 },
  laterName: { flexShrink: 1, fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  laterSum: { fontFamily: font.regular },
});
