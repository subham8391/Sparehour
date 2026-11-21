// Today as the phone draws it (ANDROID_APP_SPEC.md §9; SCREENS.md §2 at phone width): the sky, the day, the hero card
// with the spare-time figure, then Carried over, Today and This evening as cards of rows. Presentational: it is
// handed everything it shows, so it is drawn with fixtures in the browser preview and in tests, and with the real
// day by today.tsx. What it does not have yet is said in the spec (§10, step 2): the timeline, swipes, row menus.
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { Icon } from "~/ui/icon";
import { TARGET, colours, font, sky, type Colours, type Scheme } from "~/ui/theme";
import type { Row } from "./today-rows";
import type { Summary } from "./today-summary";

export interface TodayViewProps {
  scheme: Scheme;
  part: DayPart;
  /** "Today · Evening" */
  eyebrow: string;
  /** "Saturday 21 November" */
  title: string;
  summary: Summary;
  rows: readonly Row[];
  defaultEstimateMin: number;
  onComplete: (task: Task) => void;
  onMenu: () => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

export function TodayView(p: TodayViewProps) {
  const c = colours[p.scheme];
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <LinearGradient colors={sky(p.scheme, p.part)} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: (p.bottomRoom ?? 0) + 24 }}>
        <View style={styles.head}>
          <View style={styles.headRow}>
            <Text style={[styles.eyebrow, { color: c.ink3 }]}>{p.eyebrow.toUpperCase()}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Today options" onPress={p.onMenu} hitSlop={8} style={styles.iconButton}>
              <Icon name="more" size={22} color={c.ink2} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
            {p.title}
          </Text>
        </View>

        <Hero summary={p.summary} c={c} />

        {p.rows.length === 0 ? (
          <>
            <SectionLabel label="Today" count={0} c={c} />
            <View style={[styles.card, styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Text style={[styles.emptyTitle, { color: c.ink }]}>Nothing planned for today.</Text>
              <Text style={[styles.emptyLine, { color: c.ink3 }]}>Tap + to add a task.</Text>
            </View>
          </>
        ) : (
          <Sections rows={p.rows} c={c} defaultEstimateMin={p.defaultEstimateMin} onComplete={p.onComplete} />
        )}
      </ScrollView>
    </View>
  );
}

function Hero({ summary, c }: { summary: Summary; c: Colours }) {
  if (summary.kind === "none") {
    if (!summary.line) return null;
    return (
      <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={[styles.heroNote, { color: c.ink2 }]}>{summary.line}</Text>
      </View>
    );
  }
  const over = summary.kind === "over";
  const s = summary.shares;
  return (
    <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.line }]}>
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
    </View>
  );
}

function SectionLabel({ label, count, minutes, c }: { label: string; count: number; minutes?: number; c: Colours }) {
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: c.ink3 }]}>
      {label.toUpperCase()} <Text style={{ color: c.ink }}>{count}</Text>
      {minutes !== undefined ? ` · ${formatMinutes(minutes)}` : ""}
    </Text>
  );
}

/** Each section is a label over one card; the card's rows are divided by hairlines, as the web's list cards are. */
function Sections({ rows, c, defaultEstimateMin, onComplete }: { rows: readonly Row[]; c: Colours; defaultEstimateMin: number; onComplete: (task: Task) => void }) {
  const groups: { label: string; tasks: Task[] }[] = [];
  for (const row of rows) {
    if (row.kind === "header") groups.push({ label: row.label, tasks: [] });
    else groups[groups.length - 1]?.tasks.push(row.task);
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.label}>
          <SectionLabel label={g.label} count={g.tasks.length} minutes={g.tasks.reduce((sum, t) => sum + (t.estimateMin ?? defaultEstimateMin), 0)} c={c} />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            {g.tasks.map((task, i) => (
              <TaskLine key={task.id} task={task} first={i === 0} c={c} defaultEstimateMin={defaultEstimateMin} onComplete={onComplete} />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function TaskLine({ task, first, c, defaultEstimateMin, onComplete }: { task: Task; first: boolean; c: Colours; defaultEstimateMin: number; onComplete: (task: Task) => void }) {
  const guessed = !task.estimateMin;
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => onComplete(task)} style={styles.ringTarget}>
        <View style={[styles.ring, { borderColor: c.lineControl }]} />
      </Pressable>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: c.ink }]}>
        {task.title}
      </Text>
      {task.carryCount > 0 && <Text style={[styles.rowMeta, { color: c.ink3 }]}>×{task.carryCount}</Text>}
      {/* No estimate: the account's default, with a question mark in a dashed chip, as on the web. */}
      <View style={[styles.chip, { borderColor: c.line, backgroundColor: guessed ? "transparent" : c.surface2, borderStyle: guessed ? "dashed" : "solid" }]}>
        <Text accessibilityLabel={guessed ? `No estimate, counted as ${formatMinutes(defaultEstimateMin)}` : formatMinutes(task.estimateMin ?? 0)} style={[styles.chipText, { color: c.ink2 }]}>
          {guessed ? `${formatMinutes(defaultEstimateMin)}?` : formatMinutes(task.estimateMin ?? 0)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: 20, paddingBottom: 16 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TARGET },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  iconButton: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center", marginRight: -10 },
  title: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, maxWidth: 300 },
  hero: { marginHorizontal: 16, borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  heroNote: { fontFamily: font.medium, fontSize: 17 },
  figure: { fontFamily: font.bold, fontSize: 38, lineHeight: 44, letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: font.semibold, fontSize: 22, letterSpacing: 0 },
  bar: { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden" },
  heroLine: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  section: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, marginTop: 22, marginBottom: 8, marginHorizontal: 22, fontVariant: ["tabular-nums"] },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  empty: { paddingHorizontal: 18, paddingVertical: 20, gap: 6 },
  emptyTitle: { fontFamily: font.medium, fontSize: 20, lineHeight: 26 },
  emptyLine: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingRight: 14, gap: 8 },
  ringTarget: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6 },
  rowTitle: { flex: 1, fontFamily: font.medium, fontSize: 17, lineHeight: 23, paddingVertical: 10 },
  rowMeta: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 26, justifyContent: "center" },
  chipText: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
