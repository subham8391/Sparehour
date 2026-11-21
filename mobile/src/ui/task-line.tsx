// A task as one row of a list card (SCREENS.md §2.4 at phone width; the web's is features/tasks/task-row.tsx): the
// ring that completes it, the title (two lines at most), a quiet line under it for where and when (the project, a
// day, its tags), and its chips at the far edge: a time, a deadline in the web's words (red only when missed), ×N
// once it has been carried over more than once, the estimate (dashed with a question mark when it is a guess). A
// priority leads the row as ! or !!, never in a warning colour; an estimate over eight hours is gently asked about;
// a task that has not started yet is dimmed. A tap on the title opens the task; the ring is its own 52-point
// target. While rows are being ticked the row leads with its checkbox. What a row does beyond this (its ⋯ menu, its
// swipes, the long-press that ticks it) is screens/rows/task-row.tsx, which draws this.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Temporal, compareDates, formatMinutes, formatTime, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { LONG_ESTIMATE_MIN, LONG_HINT, carriedLabel } from "@/features/tasks/row-words";
import { deadlineWording } from "@/ui/relative-day";
import { CheckBox } from "./check-box";
import { Chip } from "./chip";
import { Icon } from "./icon";
import { font, useColours } from "./theme";

/** A press held this long ticks the row, as on the web (task-row.tsx). */
export const LONG_PRESS_MS = 500;

export interface TaskLineProps {
  task: Task;
  /** The account's default estimate, shown with a question mark on a task that has none. */
  defaultEstimateMin: number;
  /** The day the list stands on, so a deadline can say whether it was missed; the phone's own date where a list has none. */
  today?: LocalDate;
  /** The day the list is for when it is not today (Today stepped to a later day): a task that has started by then is not dimmed. */
  listDay?: LocalDate;
  /** Where and when, under the title, said whole: "Acme · @calls", "Wed 25 Nov". Nothing is added to it. */
  detail?: string;
  /** The quiet run's own pieces ("Acme", "Tomorrow"); the task's tags follow them, each as @name, as on the web. */
  meta?: string;
  /** Anything more at the far edge, before the chips (a block's time, "+1", a day or a state). */
  extra?: ReactNode;
  /** Finished rows are drawn struck through with a filled ring; the ring then reopens. */
  done?: boolean;
  /** The ring's action; left out, the ring is only drawn (a row that cannot be completed). */
  onComplete?: (task: Task) => void;
  onPress?: (task: Task) => void;
  /** A press held on the row (it ticks the row for a bulk edit). */
  onLongPress?: (task: Task) => void;
  /** Rows are being ticked: the row leads with its checkbox, and the priority mark steps aside for it. */
  select?: { ticked: boolean; onToggle: () => void };
}

export function TaskLine({ task, defaultEstimateMin, today, listDay, detail, meta, extra, done = false, onComplete, onPress, onLongPress, select }: TaskLineProps) {
  const c = useColours();
  const day = today ?? Temporal.Now.plainDateISO();
  const guessed = !task.estimateMin;
  const missed = Boolean(task.deadline && compareDates(task.deadline, day) < 0);
  const deadline = task.deadline ? deadlineWording(task.deadline, day).label : null;
  const long = task.estimateMin != null && task.estimateMin > LONG_ESTIMATE_MIN;
  // A task whose start date is still ahead shows dimmed (PRODUCT_SPEC.md §8.1); it lights up on that day.
  const later = Boolean(task.startDate && compareDates(task.startDate, listDay ?? day) > 0);
  const line = detail ?? ([meta, ...(task.tags ?? []).map((t) => `@${t}`)].filter(Boolean).join(" · ") || undefined);
  const hold = onLongPress ? () => onLongPress(task) : undefined;
  const ring = <View style={[styles.ring, { borderColor: done ? c.ink3 : c.lineControl, backgroundColor: done ? c.ink3 : "transparent" }]}>{done && <Icon name="check" size={14} color={c.surface} strokeWidth={2.4} />}</View>;
  return (
    <View style={styles.row}>
      {select ? <CheckBox checked={select.ticked} onChange={select.onToggle} accessibilityLabel={`Select ${task.title}`} /> : null}
      {task.priority > 1 && !done && !select ? (
        // !1 (stored 3) and !2 (stored 2) lead the row, the second a step quieter; never a warning colour (SCREENS.md §2.4).
        <View pointerEvents="none" style={styles.priority}>
          <Text accessibilityRole="image" accessibilityLabel={`priority ${4 - task.priority}`} style={[styles.priorityText, { color: task.priority > 2 ? c.ink : c.ink2 }]}>
            {task.priority > 2 ? "!!" : "!"}
          </Text>
        </View>
      ) : null}
      {onComplete ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${done ? "Reopen" : "Complete"} ${task.title}`} onPress={() => onComplete(task)} onLongPress={hold} delayLongPress={LONG_PRESS_MS} style={[styles.ringTarget, select && styles.ringBeside]}>
          {ring}
        </Pressable>
      ) : (
        <View aria-hidden style={[styles.ringTarget, select && styles.ringBeside]}>
          {ring}
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={task.title} disabled={!onPress && !hold} onPress={() => onPress?.(task)} onLongPress={hold} delayLongPress={LONG_PRESS_MS} style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: done || later ? c.ink3 : c.ink }, done && styles.struck]}>
          {task.title}
        </Text>
        {line ? (
          <Text numberOfLines={1} style={[styles.detail, { color: c.ink3 }]}>
            {line}
          </Text>
        ) : null}
        {/* Over 8 hours is saved as asked and gently questioned: quiet words, never a warning colour. */}
        {long && !done ? <Text style={[styles.detail, { color: c.ink2 }]}>{LONG_HINT}</Text> : null}
      </Pressable>
      <View style={styles.meta}>
        {extra}
        {done ? (
          // A finished row keeps its chips, quietened: plain words in ink-3, as on the web.
          <>
            {task.doTime ? <Quiet label={formatTime(task.doTime)} /> : null}
            {deadline ? <Quiet label={deadline} says={`Deadline ${deadline}`} /> : null}
            {task.carryCount > 1 ? <Quiet label={`×${task.carryCount}`} says={carriedLabel(task, day)} /> : null}
            <Quiet label={guessed ? `${formatMinutes(defaultEstimateMin)}?` : formatMinutes(task.estimateMin ?? 0)} says={guessed ? `No estimate, counted as ${formatMinutes(defaultEstimateMin)}` : undefined} />
          </>
        ) : (
          <>
            {task.doTime ? <Chip tone="time" label={formatTime(task.doTime)} /> : null}
            {deadline ? <Chip tone={missed ? "deadline" : "neutral"} label={deadline} accessibilityLabel={`${missed ? "Deadline missed" : "Deadline"} ${deadline}`} /> : null}
            {task.carryCount > 1 ? (
              // Neutral and factual, never red (SCREENS.md §2.3); the words say since when, while the task is still behind.
              <Text accessibilityLabel={carriedLabel(task, day)} style={[styles.count, { color: c.ink3 }]}>
                ×{task.carryCount}
              </Text>
            ) : null}
            {guessed ? <Chip tone="guess" label={`${formatMinutes(defaultEstimateMin)}?`} accessibilityLabel={`No estimate, counted as ${formatMinutes(defaultEstimateMin)}`} /> : <Chip label={formatMinutes(task.estimateMin ?? 0)} />}
          </>
        )}
      </View>
    </View>
  );
}

/** A finished row's chip: the words alone, in ink-3 (at part opacity a chip fell under the contrast the text needs). */
function Quiet({ label, says }: { label: string; says?: string }) {
  const c = useColours();
  return (
    <Text accessibilityLabel={says} style={[styles.count, { color: c.ink3 }]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingRight: 14 },
  ringTarget: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center" },
  // Beside the checkbox the ring gives up its lead, so the title keeps its room.
  ringBeside: { width: 40, marginLeft: -4 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  priority: { position: "absolute", left: 4, top: 0, bottom: 0, justifyContent: "center" },
  priorityText: { fontFamily: font.semibold, fontSize: 12 },
  body: { flex: 1, paddingVertical: 10, justifyContent: "center", minHeight: 56 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  struck: { textDecorationLine: "line-through" },
  detail: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, marginTop: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8, flexShrink: 0, maxWidth: "52%", flexWrap: "wrap", justifyContent: "flex-end", paddingVertical: 8 },
  count: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
