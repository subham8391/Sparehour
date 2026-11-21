// The detail's day pickers as bottom sheets (SCREENS.md §10 "Responsive": field popovers become sheets). Do: a date
// typed in words, Today and the snooze presets, a month to pick from, a time, No day; and for a repeating task whose
// day changes, the question "just this once, or change the rule?". Deadline and Starts: the typed date, the days the
// presets land on, the month, Clear. Presentational; every rule here is the web's own (features/tasks/detail-rules.ts,
// date-choices.ts, snooze.ts, series-words.ts).
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { formatTime, type Instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { RecurrenceException, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { dateChoices } from "@/features/tasks/date-choices";
import { movesDay, timePatch, type SeriesDayChange } from "@/features/tasks/detail-rules";
import { rebasedWords } from "@/features/tasks/series-words";
import { snoozePresets } from "@/features/tasks/snooze";
import { Button } from "~/ui/button";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { MonthCalendar } from "~/ui/month-calendar";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";
import { TimePicker } from "~/ui/time-picker";
import { TypedDateField } from "./typed-fields";

export interface DoSheetProps {
  open: boolean;
  task: Task;
  now: Instant;
  zone: string;
  today: LocalDate;
  exceptions?: readonly RecurrenceException[];
  /** A new day on this task is asked about first (a repeating task whose series can be edited). */
  asks: boolean;
  onPatch: (patch: TaskPatch) => void;
  onSeriesDay?: (choice: "once" | "rule", change: SeriesDayChange) => void;
  onClose: () => void;
}

export function DoSheet(p: DoSheetProps) {
  return (
    <Sheet open={p.open} title="Do" onClose={p.onClose} footer={<Button variant="quiet" label="Done" onPress={p.onClose} />}>
      <DoBody {...p} />
    </Sheet>
  );
}

function DoBody({ task, now, zone, today, exceptions, asks, onPatch, onSeriesDay, onClose }: DoSheetProps) {
  // The day waiting on "just this once, or change the rule?"; closing the sheet forgets an unanswered question.
  const [pending, setPending] = useState<SeriesDayChange | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const pick = (patch: TaskPatch, close: boolean) => {
    if (asks && movesDay(task, patch)) {
      setPending({ doDate: patch.doDate, doTime: patch.doTime, evening: patch.evening });
      return;
    }
    onPatch(patch);
    if (close) onClose();
  };
  if (pending) {
    // The question takes the sheet's place, so it is never below the fold of a short phone.
    return (
      <SeriesQuestion
        task={task}
        day={pending.doDate}
        today={today}
        exceptions={exceptions}
        onAnswer={(choice) => {
          onSeriesDay?.(choice, pending);
          onClose();
        }}
        onBack={() => setPending(null)}
      />
    );
  }
  const time = task.doTime ? task.doTime.toString({ smallestUnit: "minute" }) : "";
  return (
    <>
      <TypedDateField now={now} zone={zone} today={today} withTime onApply={(d) => pick({ doDate: d.date, doTime: d.time, evening: d.evening }, true)} />
      <View style={styles.wrap}>
        <Button label="Today" onPress={() => pick({ doDate: today, doTime: null, evening: false }, true)} />
        {snoozePresets(now, zone, today).map((s) => (
          <Button key={s.id} label={s.label} onPress={() => pick(s.patch, true)} />
        ))}
      </View>
      <MonthCalendar value={task.doDate} today={today} onPick={(day) => pick({ doDate: day }, false)} />
      <MenuDivider />
      <MenuRow label="Time" icon="clock" hint={task.doTime ? formatTime(task.doTime) : "No time"} accessibilityLabel={`Time, ${task.doTime ? formatTime(task.doTime) : "none"}`} onPress={() => setTimeOpen((v) => !v)} />
      {timeOpen ? (
        <TimePicker
          value={time}
          clear="No time"
          onSet={(v) => {
            onPatch(timePatch(task, v, today));
            setTimeOpen(false);
          }}
        />
      ) : null}
      {task.doDate ? <Button variant="quiet" label="No day" onPress={() => pick({ doDate: null, doTime: null, evening: false }, true)} style={styles.clear} /> : null}
    </>
  );
}

/** Asked when the Do date of a repeating task changes: move only this occurrence, or move the rule to the new day. */
function SeriesQuestion({ task, day, today, exceptions = [], onAnswer, onBack }: { task: Task; day: LocalDate; today: LocalDate; exceptions?: readonly RecurrenceException[]; onAnswer: (choice: "once" | "rule") => void; onBack: () => void }) {
  const c = useColours();
  const rebased = rebasedWords(task, day, today, exceptions);
  return (
    <View accessibilityLabel="This occurrence or the rule" style={styles.gap}>
      <Text style={[styles.question, { color: c.ink }]}>Move to {formatDay(day, { today })}: just this once, or change the rule?</Text>
      <View style={styles.pair}>
        <Button label="Just this once" onPress={() => onAnswer("once")} style={styles.half} />
        <Button label="Change the rule" onPress={() => onAnswer("rule")} style={styles.half} />
      </View>
      {rebased ? <Text style={[styles.note, { color: c.ink2 }]}>Changing the rule makes it repeat {rebased} from then.</Text> : null}
      <Button variant="quiet" label="Choose another day" onPress={onBack} style={styles.clear} />
    </View>
  );
}

export interface DateSheetProps {
  open: boolean;
  /** "Deadline", "Starts". */
  title: string;
  value: LocalDate | null;
  now: Instant;
  zone: string;
  today: LocalDate;
  /** The day chosen, or null for Clear; the sheet closes itself. */
  onChange: (day: LocalDate | null) => void;
  onClose: () => void;
}

export function DateSheet({ open, title, value, now, zone, today, onChange, onClose }: DateSheetProps) {
  const set = (day: LocalDate | null) => {
    onChange(day);
    onClose();
  };
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={<Button variant="quiet" label="Cancel" onPress={onClose} />}>
      <TypedDateField now={now} zone={zone} today={today} onApply={(d) => set(d.date)} />
      <View style={styles.wrap}>
        {dateChoices(today, snoozePresets(now, zone, today)).map((d) => {
          const on = value?.equals(d.date) ?? false;
          return <Button key={d.label} label={d.label} accessibilityLabel={on ? `${d.label}, chosen` : d.label} variant={on ? "primary" : "secondary"} onPress={() => set(d.date)} />;
        })}
      </View>
      <MonthCalendar value={value} today={today} onPick={set} />
      {value ? <Button variant="quiet" label="Clear" onPress={() => set(null)} style={styles.clear} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gap: { gap: 12 },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1, paddingHorizontal: 8 },
  question: { fontFamily: font.medium, fontSize: 17, lineHeight: 24 },
  note: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  clear: { alignSelf: "flex-start", marginLeft: -12 },
});
