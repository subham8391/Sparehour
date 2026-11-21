// Someday's two sheets on the phone (SCREENS.md §7). A row's ⋯ opens its actions: Today · Pick a date · Back to
// active · Drop, with the picker as a second step of the same sheet: the next seven days, then a month to pick any
// other day from. Review walks what the rollover filed on its own, one task at a time: Keep in Someday · Today ·
// Pick a date · Drop, each one tap, then the next task. Presentational: the days, the task and what each choice
// does are handed in.
import { StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import { Button } from "~/ui/button";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { MonthCalendar } from "~/ui/month-calendar";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";

/** One of the picker's days: "Today" with "Sat 21" beside it, or "Thu 26" alone. */
export interface PickDay {
  day: LocalDate;
  name: string;
  /** The weekday and date, when the name is a word ("Today", "Tomorrow"). */
  date?: string;
}

function Days({ days, today, title, onPick }: { days: readonly PickDay[]; today: LocalDate; title: string; onPick: (day: LocalDate) => void }) {
  return (
    <>
      {days.map((d) => (
        <MenuRow key={d.day.toString()} label={d.name} hint={d.date} accessibilityLabel={`Move ${title} to ${d.name}${d.date ? `, ${d.date}` : ""}`} onPress={() => onPick(d.day)} />
      ))}
      <MenuDivider />
      {/* Any other day, from today on: the web's date field. */}
      <MonthCalendar value={null} today={today} min={today} onPick={onPick} />
    </>
  );
}

export interface SomedayActionsProps {
  /** The task whose ⋯ was tapped; null when the sheet is closed. */
  task: { id: string; title: string } | null;
  step: "menu" | "days";
  today: LocalDate;
  days: readonly PickDay[];
  onToday: () => void;
  onPickADate: () => void;
  onPickDay: (day: LocalDate) => void;
  onBackToActive: () => void;
  onDrop: () => void;
  onClose: () => void;
}

export function SomedayActions(p: SomedayActionsProps) {
  const title = p.task?.title ?? "";
  return (
    <Sheet open={p.task !== null} title={p.step === "days" ? "Pick a date" : title} onClose={p.onClose}>
      {p.step === "days" ? (
        <Days days={p.days} today={p.today} title={title} onPick={p.onPickDay} />
      ) : (
        <>
          <MenuRow label="Today" onPress={p.onToday} />
          <MenuRow label="Pick a date" onPress={p.onPickADate} />
          <MenuRow label="Back to active" onPress={p.onBackToActive} />
          <MenuDivider />
          {/* Drop is undoable, so it reads in ink like the rest (ruling R2). */}
          <MenuRow label="Drop" onPress={p.onDrop} />
        </>
      )}
    </Sheet>
  );
}

export interface SomedayReviewProps {
  open: boolean;
  /** The task being asked about; null once every one has been answered. */
  task: { id: string; title: string } | null;
  /** "1 of 3" */
  position: string;
  /** "Acme · Last touched Tue 3 Nov" */
  line: string;
  step: "ask" | "days";
  today: LocalDate;
  days: readonly PickDay[];
  onKeep: () => void;
  onToday: () => void;
  onPickADate: () => void;
  onPickDay: (day: LocalDate) => void;
  onDrop: () => void;
  onClose: () => void;
}

export function SomedayReview(p: SomedayReviewProps) {
  const c = useColours();
  return (
    <Sheet open={p.open} title="Review what moved to Someday" onClose={p.onClose} footer={p.task ? <Button variant="quiet" label="Close" onPress={p.onClose} /> : <Button variant="primary" label="Done" onPress={p.onClose} />}>
      {p.task ? (
        <>
          <Text style={[styles.position, { color: c.ink2 }]}>{p.position}</Text>
          <Text accessibilityRole="header" style={[styles.task, { color: c.ink }]}>
            {p.task.title}
          </Text>
          {p.line ? <Text style={[styles.line, { color: c.ink2 }]}>{p.line}</Text> : null}
          {p.step === "days" ? (
            <Days days={p.days} today={p.today} title={p.task.title} onPick={p.onPickDay} />
          ) : (
            <View style={styles.answers}>
              <Button variant="primary" block label="Keep in Someday" onPress={p.onKeep} />
              <Button block label="Today" onPress={p.onToday} />
              <Button block label="Pick a date" accessibilityLabel={`Pick a date for ${p.task.title}`} onPress={p.onPickADate} />
              <Button block label="Drop" onPress={p.onDrop} />
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.position, { color: c.ink2 }]}>Reviewed</Text>
          <Text style={[styles.task, { color: c.ink }]}>That’s all of them.</Text>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  position: { fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  task: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28 },
  line: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  answers: { gap: 8, marginTop: 8 },
});
