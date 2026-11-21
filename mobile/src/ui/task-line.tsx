// A task as one row of a list card (SCREENS.md §2.4 at phone width): the ring that completes it, the title (two
// lines at most), a quiet line under it for where and when (the project, a tag, a day), and its chips at the far
// edge: a time, a deadline (red only when missed), the estimate (dashed with a question mark when it is a guess).
// A tap on the title opens the task; the ring is its own 52-point target.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { compareDates, formatMinutes, formatTime, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { Chip } from "./chip";
import { Icon } from "./icon";
import { font, useColours } from "./theme";

export interface TaskLineProps {
  task: Task;
  /** The account's default estimate, shown with a question mark on a task that has none. */
  defaultEstimateMin: number;
  /** The day the list stands on, so a deadline can say whether it was missed. */
  today?: LocalDate;
  /** Where and when, under the title: "Acme · @calls", "Wed 25 Nov". */
  detail?: string;
  /** Anything more at the far edge, before the chips (a block's time, "+1"). */
  extra?: ReactNode;
  /** Finished rows are drawn struck through with a filled ring; the ring then reopens. */
  done?: boolean;
  onComplete: (task: Task) => void;
  onPress?: (task: Task) => void;
}

export function TaskLine({ task, defaultEstimateMin, today, detail, extra, done = false, onComplete, onPress }: TaskLineProps) {
  const c = useColours();
  const guessed = !task.estimateMin;
  const missed = Boolean(task.deadline && today && compareDates(task.deadline, today) < 0);
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${done ? "Reopen" : "Complete"} ${task.title}`} onPress={() => onComplete(task)} style={styles.ringTarget}>
        <View style={[styles.ring, { borderColor: done ? c.ink3 : c.lineControl, backgroundColor: done ? c.ink3 : "transparent" }]}>{done && <Icon name="check" size={14} color={c.surface} strokeWidth={2.4} />}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={task.title} disabled={!onPress} onPress={() => onPress?.(task)} style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: done ? c.ink3 : c.ink }, done && styles.struck]}>
          {task.title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.detail, { color: c.ink3 }]}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
      <View style={styles.meta}>
        {task.carryCount > 0 && !done && <Text style={[styles.count, { color: c.ink3 }]}>×{task.carryCount}</Text>}
        {extra}
        {task.doTime && !done && <Chip tone="time" label={formatTime(task.doTime)} />}
        {task.deadline && !done && <Chip tone={missed ? "deadline" : "neutral"} label={formatDay(task.deadline, { today })} accessibilityLabel={`${missed ? "Deadline missed" : "Deadline"} ${formatDay(task.deadline, { today })}`} />}
        {!done &&
          (guessed ? (
            <Chip tone="guess" label={`${formatMinutes(defaultEstimateMin)}?`} accessibilityLabel={`No estimate, counted as ${formatMinutes(defaultEstimateMin)}`} />
          ) : (
            <Chip label={formatMinutes(task.estimateMin ?? 0)} />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingRight: 14 },
  ringTarget: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, paddingVertical: 10, justifyContent: "center", minHeight: 56 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  struck: { textDecorationLine: "line-through" },
  detail: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, marginTop: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8, flexShrink: 0, maxWidth: "52%", flexWrap: "wrap", justifyContent: "flex-end", paddingVertical: 8 },
  count: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
