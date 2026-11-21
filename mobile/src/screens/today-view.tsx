// Today as the phone draws it (ANDROID_APP_SPEC.md §9; SCREENS.md §2 at phone width): the sky, the day, the hero card
// with the spare-time figure, then Carried over, Today and This evening as cards of rows. Presentational: it is
// handed everything it shows, so it is drawn with fixtures in the browser preview and in tests, and with the real
// day by today.tsx.
import { StyleSheet, Text, View } from "react-native";
import { formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { Card, CardRow } from "~/ui/card";
import { Empty } from "~/ui/empty";
import { IconButton, Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { TaskLine } from "~/ui/task-line";
import { font, useColours, type Colours } from "~/ui/theme";
import type { Row } from "./today-rows";
import type { Summary } from "./today-summary";

export interface TodayViewProps {
  part: DayPart;
  /** "Today · Evening" */
  eyebrow: string;
  /** "Saturday 21 November" */
  title: string;
  today?: LocalDate;
  summary: Summary;
  rows: readonly Row[];
  defaultEstimateMin: number;
  onComplete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onMenu: () => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

export function TodayView(p: TodayViewProps) {
  const c = useColours();
  const groups: { label: string; tasks: Task[] }[] = [];
  for (const row of p.rows) {
    if (row.kind === "header") groups.push({ label: row.label, tasks: [] });
    else groups[groups.length - 1]?.tasks.push(row.task);
  }
  return (
    <Screen title={p.title} eyebrow={p.eyebrow} part={p.part} bottomRoom={p.bottomRoom} actions={<IconButton icon="more" label="Today options" onPress={p.onMenu} />}>
      <Hero summary={p.summary} c={c} />
      {groups.length === 0 ? (
        <>
          <SectionLabel label="Today" count={0} />
          <Empty title="Nothing planned for today." line="Tap + to add a task." />
        </>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <SectionLabel label={g.label} count={g.tasks.length} detail={formatMinutes(g.tasks.reduce((sum, t) => sum + (t.estimateMin ?? p.defaultEstimateMin), 0))} />
            <Card>
              {g.tasks.map((task, i) => (
                <CardRow key={task.id} first={i === 0}>
                  <TaskLine task={task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} onComplete={p.onComplete} onPress={p.onOpen} />
                </CardRow>
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

function Hero({ summary, c }: { summary: Summary; c: Colours }) {
  if (summary.kind === "none") {
    if (!summary.line) return null;
    return (
      <Card style={styles.hero}>
        <Text style={[styles.heroNote, { color: c.ink2 }]}>{summary.line}</Text>
      </Card>
    );
  }
  const over = summary.kind === "over";
  const s = summary.shares;
  return (
    <Card style={styles.hero}>
      <Text accessibilityLabel={`${summary.figure} ${over ? "over" : "spare"}`} style={[styles.figure, { color: c.ink }]}>
        {summary.figure} <Text style={[styles.unit, { color: over ? c.over : c.spare }]}>{over ? "over" : "spare"}</Text>
      </Text>
      {/* The working day in its parts: meetings, what is planned, the buffer, and what is spare. Aqua is spare time only. */}
      <View aria-hidden style={[styles.bar, { backgroundColor: over ? c.overSoft : c.surface2 }]}>
        <View style={{ flex: s.busy, backgroundColor: c.meetFill }} />
        <View style={{ flex: s.planned, backgroundColor: over ? c.overFill : c.blockFill }} />
        <View style={{ flex: s.buffer, backgroundColor: c.lineStrong }} />
        <View style={{ flex: s.spare, backgroundColor: c.spareFill }} />
        <View style={{ flex: Math.max(0, 1 - s.busy - s.planned - s.buffer - s.spare) }} />
      </View>
      <Text style={[styles.heroLine, { color: c.ink2 }]}>{summary.line}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  heroNote: { fontFamily: font.medium, fontSize: 17 },
  figure: { fontFamily: font.bold, fontSize: 38, lineHeight: 44, letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: font.semibold, fontSize: 22, letterSpacing: 0 },
  bar: { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden" },
  heroLine: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
});
