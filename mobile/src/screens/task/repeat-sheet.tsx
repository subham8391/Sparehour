// The detail's Repeat picker as a bottom sheet (SCREENS.md §10 "Recurring"): the rule typed in words ("every
// weekday", "every 2 weeks on wed"), the next days it lands on, "Count from when I complete it", Never, and for a
// task that repeats its own actions: Skip this occurrence, and Pause repeats until… with its picker (or the pause
// that is running and Resume). Presentational; reading the words, what a new rule does and the pause's days are the
// web's own (features/tasks/detail-rules.ts, series-words.ts).
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { RecurrenceMode, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { detailActions, nextRepeats, readRepeat, repeatChange, stopRepeat } from "@/features/tasks/detail-rules";
import { pauseChoices, pausedUntil } from "@/features/tasks/series-words";
import { Button } from "~/ui/button";
import { CheckBox } from "~/ui/check-box";
import { MenuDivider } from "~/ui/menu-row";
import { MonthCalendar } from "~/ui/month-calendar";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

export interface RepeatSheetProps {
  open: boolean;
  task: Task;
  today: LocalDate;
  /** Opens with the pause picker showing (Pause repeats until… from the footer's menu). */
  pauseFirst?: boolean;
  onPatch: (patch: TaskPatch) => void;
  /** A new rule for a task that already repeats: the series starts again from today. */
  onChangeRule?: (rule: string, mode: RecurrenceMode) => void;
  onSkipOccurrence?: () => void;
  onPause?: (until: LocalDate) => void;
  onResume?: () => void;
  onClose: () => void;
}

export function RepeatSheet(p: RepeatSheetProps) {
  return (
    <Sheet open={p.open} title="Repeat" onClose={p.onClose} footer={<Button variant="quiet" label="Done" onPress={p.onClose} />}>
      <RepeatBody {...p} />
    </Sheet>
  );
}

function RepeatBody({ task, today, pauseFirst = false, onPatch, onChangeRule, onSkipOccurrence, onPause, onResume, onClose }: RepeatSheetProps) {
  const c = useColours();
  const [spec, setSpec] = useState("");
  const [missed, setMissed] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(pauseFirst);
  const apply = () => {
    const parsed = readRepeat(spec);
    if (!parsed) {
      if (spec.trim()) setMissed(true);
      return;
    }
    const change = repeatChange(task, parsed.rule, Boolean(onChangeRule));
    if (change?.kind === "rule") onChangeRule?.(change.rule, change.mode);
    else if (change) onPatch(change.patch);
    onClose();
  };
  const paused = pausedUntil(task, today);
  const seriesActions = detailActions(task).repeating && Boolean(onSkipOccurrence || onPause || onResume);
  const afterCompletion = task.recurrenceMode === "after_completion";
  return (
    <>
      <View>
        <View style={styles.row}>
          <TextField
            accessibilityLabel="Repeat, in words"
            placeholder="every weekday · every 2 weeks on wed"
            value={spec}
            onChangeText={(t) => {
              setSpec(t);
              setMissed(false);
            }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={apply}
            style={styles.field}
          />
          <Button label="Set" accessibilityLabel="Set the repeat" onPress={apply} />
        </View>
        {missed ? (
          <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: c.ink2 }]}>
            Didn't catch that. Try "every weekday" or "every month".
          </Text>
        ) : null}
      </View>
      {task.recurrenceRule ? (
        <>
          <Text style={[styles.next, { color: c.ink2 }]}>
            Next:{" "}
            {nextRepeats(task, today)
              .map((d) => formatDay(d, { today }))
              .join(" · ")}
          </Text>
          <View style={styles.check}>
            <CheckBox accessibilityLabel="Count from when I complete it" checked={afterCompletion} onChange={(checked) => onPatch({ recurrenceMode: checked ? "after_completion" : "fixed" })} />
            <Text style={[styles.checkLabel, { color: c.ink2 }]}>Count from when I complete it</Text>
          </View>
          <Button variant="quiet" label="Never" accessibilityLabel="Never: stop repeating" onPress={() => (onPatch(stopRepeat(task)), onClose())} style={styles.clear} />
        </>
      ) : null}
      {seriesActions ? (
        // This occurrence and the pause: kept apart from If missed → Skip, which is a policy, not an action.
        <>
          <MenuDivider />
          {onSkipOccurrence && !paused ? <Button variant="quiet" label="Skip this occurrence" onPress={() => (onSkipOccurrence(), onClose())} style={styles.clear} /> : null}
          {paused ? (
            <View style={styles.row}>
              <Text style={[styles.next, styles.field, { color: c.ink2 }]}>Paused until {formatDay(paused, { today })}</Text>
              {onResume ? <Button variant="quiet" label="Resume" onPress={() => (onResume(), onClose())} /> : null}
            </View>
          ) : onPause ? (
            pauseOpen ? (
              <PausePicker today={today} onPause={(until) => (onPause(until), onClose())} />
            ) : (
              <Button variant="quiet" label="Pause repeats until…" onPress={() => setPauseOpen(true)} style={styles.clear} />
            )
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** "Pause repeats until…": a few days from now, or any day after today from the month. */
function PausePicker({ today, onPause }: { today: LocalDate; onPause: (until: LocalDate) => void }) {
  const c = useColours();
  const [day, setDay] = useState<LocalDate | null>(null);
  return (
    <View accessibilityLabel="Pause repeats until" style={styles.gap}>
      <Text style={[styles.next, { color: c.ink2 }]}>Pause repeats until</Text>
      <View style={styles.wrap}>
        {pauseChoices(today).map((choice) => (
          <Button key={choice.label} label={choice.label} onPress={() => onPause(choice.date)} />
        ))}
      </View>
      <MonthCalendar value={day} today={today} min={today.add({ days: 1 })} onPick={setDay} />
      <Button variant="primary" label={day ? `Pause until ${formatDay(day, { today })}` : "Pause"} disabled={!day} onPress={() => day && onPause(day)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gap: { gap: 10 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
  next: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, fontVariant: ["tabular-nums"] },
  check: { flexDirection: "row", alignItems: "center", marginLeft: -11 },
  checkLabel: { flex: 1, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  clear: { alignSelf: "flex-start", marginLeft: -12 },
});
