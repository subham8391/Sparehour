// "Not yet planned" on the phone (SCREENS.md §3 "Responsive"): a strip pinned over the tab bar, clear of the add
// button, reading "Not yet planned · 5"; it opens a sheet where every task has the next seven days under it, each
// with its bar, and a tap puts the task at the end of that day (one write, one undo, the web's own moveToDay); "Pick
// a date" opens a month for any other day from today on.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { StripDay } from "@/features/upcoming/agenda";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { MonthCalendar } from "~/ui/month-calendar";
import { Sheet } from "~/ui/sheet";
import { TaskLine } from "~/ui/task-line";
import { font, useColours, useShadows } from "~/ui/theme";
import { DayStrip } from "./day-strip";

export function UnplannedStrip({ count, onOpen, bottom }: { count: number; onOpen: () => void; /** How far over the screen's foot it sits. */ bottom: number }) {
  const c = useColours();
  const shadows = useShadows();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Not yet planned, ${count}`} onPress={onOpen} style={[styles.strip, { bottom, backgroundColor: c.surface, borderColor: c.lineStrong, boxShadow: shadows.fab ?? undefined }]}>
      <Text numberOfLines={1} style={[styles.stripText, { color: c.ink }]}>
        Not yet planned <Text style={{ color: c.ink2 }}>· {count}</Text>
      </Text>
      <Icon name="chevron-right" size={16} color={c.ink3} />
    </Pressable>
  );
}

export interface UnplannedSheetProps {
  open: boolean;
  tasks: readonly Task[];
  /** The next seven days from today, with their bars: what each task can be placed on at a tap. */
  days: readonly StripDay[];
  today: LocalDate;
  defaultEstimateMin: number;
  detail: (task: Task) => string | undefined;
  onPlace: (task: Task, day: LocalDate) => void;
  onComplete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onClose: () => void;
}

export function UnplannedSheet({ open, tasks, days, today, defaultEstimateMin, detail, onPlace, onComplete, onOpen, onClose }: UnplannedSheetProps) {
  const c = useColours();
  return (
    <Sheet open={open} title={`Not yet planned · ${tasks.length}`} onClose={onClose} footer={<Button variant="quiet" label="Close" onPress={onClose} />}>
      <Text style={[styles.hint, { color: c.ink2 }]}>{tasks.length === 0 ? "Every task has a day." : "Tap a day to give a task its place in the week."}</Text>
      {tasks.map((task) => (
        <Card key={task.id} style={styles.card}>
          <TaskLine
            task={task}
            today={today}
            defaultEstimateMin={defaultEstimateMin}
            detail={detail(task)}
            onComplete={onComplete}
            onPress={
              onOpen &&
              ((t) => {
                onClose();
                onOpen(t);
              })
            }
          />
          <PlaceTask task={task} days={days} today={today} onPlace={onPlace} />
        </Card>
      ))}
    </Sheet>
  );
}

/** Under each task: the seven days, then "Pick a date" for any other one. */
function PlaceTask({ task, days, today, onPlace }: { task: Task; days: readonly StripDay[]; today: LocalDate; onPlace: (task: Task, day: LocalDate) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.days}>
      <DayStrip days={days} size="pick" label={`Move “${task.title}” to`} onPick={(d) => onPlace(task, d.day)} />
      <Button variant="quiet" label={picking ? "Hide the calendar" : "Pick a date"} accessibilityLabel={picking ? `Hide the calendar for ${task.title}` : `Pick a date for ${task.title}`} onPress={() => setPicking(!picking)} style={styles.pick} />
      {picking && <MonthCalendar value={null} today={today} min={today} onPick={(day) => onPlace(task, day)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // The add button sits at the far edge (20 points in, 58 wide), so the strip stops 92 points from that edge.
  strip: { position: "absolute", left: 16, right: 92, height: 48, borderWidth: 1, borderStyle: "dashed", borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  stripText: { flex: 1, fontFamily: font.medium, fontSize: 16, fontVariant: ["tabular-nums"] },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  card: { marginHorizontal: 0 },
  days: { paddingHorizontal: 6, paddingBottom: 8 },
  pick: { alignSelf: "flex-end" },
});
